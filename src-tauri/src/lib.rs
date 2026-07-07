use base64::{engine::general_purpose, Engine as _};
use headless_chrome::{types::PrintToPdfOptions, Browser, LaunchOptions};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use std::{env, process, sync::Mutex};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, State,
};

#[derive(Default)]
struct FileState {
    current_file: Mutex<Option<PathBuf>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct FileInfo {
    name: String,
    path: String,
    is_dir: bool,
    children: Option<Vec<FileInfo>>,
}

const MAX_IMAGE_BYTES: u64 = 20 * 1024 * 1024;
const MAX_SCAN_DEPTH: usize = 20;
const MAX_SCANNED_MARKDOWN_FILES: usize = 5000;
const PDF_PAPER_WIDTH_INCHES: f64 = 8.27;
const PDF_PAPER_HEIGHT_INCHES: f64 = 11.69;
const PDF_MARGIN_INCHES: f64 = 0.4;
const PDF_VIEWPORT_WIDTH: u32 = 717;
const PDF_VIEWPORT_HEIGHT: u32 = 1046;

fn is_markdown_file_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown")
        })
        .unwrap_or(false)
}

fn has_extension(path: &Path, allowed_extensions: &[&str]) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            allowed_extensions
                .iter()
                .any(|allowed| extension.eq_ignore_ascii_case(allowed))
        })
        .unwrap_or(false)
}

fn ensure_markdown_file_path(path: &Path) -> Result<(), String> {
    if is_markdown_file_path(path) {
        Ok(())
    } else {
        Err("Only Markdown files are supported".to_string())
    }
}

fn ensure_export_file_path(path: &Path, allowed_extensions: &[&str]) -> Result<(), String> {
    if has_extension(path, allowed_extensions) {
        Ok(())
    } else {
        Err(format!(
            "Export path must end with .{}",
            allowed_extensions.join(" or .")
        ))
    }
}

fn escape_html_text(value: &str) -> String {
    value
        .chars()
        .flat_map(|character| match character {
            '&' => "&amp;".chars().collect::<Vec<_>>(),
            '<' => "&lt;".chars().collect::<Vec<_>>(),
            '>' => "&gt;".chars().collect::<Vec<_>>(),
            '"' => "&quot;".chars().collect::<Vec<_>>(),
            '\'' => "&#39;".chars().collect::<Vec<_>>(),
            _ => vec![character],
        })
        .collect()
}

fn markdown_file_arg_from_args<I, S>(args: I) -> Option<PathBuf>
where
    I: IntoIterator<Item = S>,
    S: Into<OsString>,
{
    args.into_iter().skip(1).find_map(|arg| {
        let arg = arg.into();

        if arg.to_string_lossy().starts_with('-') {
            return None;
        }

        let path = PathBuf::from(arg);
        if !is_markdown_file_path(&path) {
            return None;
        }

        Some(path)
    })
}

fn initial_file_from_args() -> Option<PathBuf> {
    markdown_file_arg_from_args(env::args_os()).filter(|path| path.is_file())
}

#[tauri::command]
async fn file_read(path: String) -> Result<String, String> {
    let path = PathBuf::from(path);
    ensure_markdown_file_path(&path)?;

    if !path.is_file() {
        return Err("Path is not a file".to_string());
    }

    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
async fn file_write(path: String, content: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    ensure_markdown_file_path(&path)?;

    let temp_path = format!("{}.tmp", path.to_string_lossy());
    fs::write(&temp_path, content).map_err(|e| format!("Failed to write temp file: {}", e))?;

    fs::rename(&temp_path, path).map_err(|e| {
        let _ = fs::remove_file(&temp_path);
        format!("Failed to rename temp file: {}", e)
    })?;

    Ok(())
}

fn image_mime_type(path: &Path) -> Option<&'static str> {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => Some("image/png"),
        Some("jpg") | Some("jpeg") => Some("image/jpeg"),
        Some("gif") => Some("image/gif"),
        Some("webp") => Some("image/webp"),
        Some("svg") => Some("image/svg+xml"),
        Some("bmp") => Some("image/bmp"),
        Some("ico") => Some("image/x-icon"),
        Some("avif") => Some("image/avif"),
        _ => None,
    }
}

#[tauri::command]
async fn read_image_as_data_url(path: String) -> Result<String, String> {
    let image_path = PathBuf::from(&path);
    let mime_type =
        image_mime_type(&image_path).ok_or_else(|| "Unsupported image format".to_string())?;
    let metadata = fs::metadata(&image_path).map_err(|e| format!("Failed to read image: {}", e))?;

    if !metadata.is_file() {
        return Err("Image path is not a file".to_string());
    }

    if metadata.len() > MAX_IMAGE_BYTES {
        return Err("Image is too large to embed".to_string());
    }

    let image_data = fs::read(&image_path).map_err(|e| format!("Failed to read image: {}", e))?;
    let encoded_data = general_purpose::STANDARD.encode(image_data);

    Ok(format!("data:{};base64,{}", mime_type, encoded_data))
}

#[tauri::command]
async fn get_current_file(state: State<'_, FileState>) -> Result<Option<String>, String> {
    let current = state.current_file.lock().unwrap();
    Ok(current.as_ref().map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
async fn set_current_file(path: Option<String>, state: State<'_, FileState>) -> Result<(), String> {
    let mut current = state.current_file.lock().unwrap();
    *current = path.map(PathBuf::from);
    Ok(())
}

#[tauri::command]
async fn scan_folder(folder_path: String) -> Result<Vec<FileInfo>, String> {
    let path = PathBuf::from(&folder_path);
    if !path.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    fn scan_directory(
        dir_path: &Path,
        depth: usize,
        visited: &mut HashSet<PathBuf>,
        markdown_file_count: &mut usize,
    ) -> Result<Vec<FileInfo>, String> {
        if depth > MAX_SCAN_DEPTH {
            return Ok(Vec::new());
        }

        let canonical_dir = fs::canonicalize(dir_path)
            .map_err(|e| format!("Failed to resolve directory: {}", e))?;

        if !visited.insert(canonical_dir.clone()) {
            return Ok(Vec::new());
        }

        let mut files = Vec::new();

        let entries =
            fs::read_dir(&canonical_dir).map_err(|e| format!("Failed to read directory: {}", e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let metadata =
                fs::symlink_metadata(&path).map_err(|e| format!("Failed to read entry: {}", e))?;

            if name.starts_with('.') || name == "node_modules" || name == "target" {
                continue;
            }

            if metadata.file_type().is_symlink() {
                continue;
            }

            if metadata.is_dir() {
                let children = scan_directory(&path, depth + 1, visited, markdown_file_count)?;
                if !children.is_empty() {
                    files.push(FileInfo {
                        name,
                        path: path.to_string_lossy().to_string(),
                        is_dir: true,
                        children: Some(children),
                    });
                }
            } else if metadata.is_file() && is_markdown_file_path(&path) {
                if *markdown_file_count >= MAX_SCANNED_MARKDOWN_FILES {
                    return Err(format!(
                        "Folder scan exceeded {} Markdown files",
                        MAX_SCANNED_MARKDOWN_FILES
                    ));
                }

                *markdown_file_count += 1;
                files.push(FileInfo {
                    name,
                    path: path.to_string_lossy().to_string(),
                    is_dir: false,
                    children: None,
                });
            }
        }

        files.sort_by(|a, b| match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.cmp(&b.name),
        });

        Ok(files)
    }

    let mut visited = HashSet::new();
    let mut markdown_file_count = 0;

    scan_directory(&path, 0, &mut visited, &mut markdown_file_count)
}

const EXPORT_DOCUMENT_STYLE: &str = r#"
body {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 1.6;
    color: #222222;
    background-color: #ffffff;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
}
* {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
}
h1, h2, h3, h4, h5, h6 {
    margin-top: 1.5em;
    margin-bottom: 0.5em;
    font-weight: 600;
    line-height: 1.25;
    color: #222222;
    page-break-after: avoid;
}
h1 {
    font-size: 2em;
    border-bottom: 1px solid #e5e5e5;
    padding-bottom: 0.3em;
}
h2 {
    font-size: 1.5em;
    color: #222222;
    border-bottom: 1px solid #e5e5e5;
    padding-bottom: 0.3em;
}
h3 { font-size: 1.25em; color: #222222; }
h4 { font-size: 1em; color: #222222; }
h5 { font-size: 0.875em; color: #222222; }
h6 { font-size: 0.85em; color: #666666; }
p { margin-top: 0; margin-bottom: 1em; }
strong { font-weight: 600; color: #111111; }
em { font-style: italic; color: inherit; }
a { color: #111111; text-decoration: none; }
a:hover { color: #000000; text-decoration: underline; }
code {
    padding: 0.2em 0.4em;
    margin: 0;
    font-size: 85%;
    color: #222222;
    background-color: #f5f5f5;
    border-radius: 3px;
    overflow-wrap: anywhere;
    word-break: break-word;
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
}
pre {
    padding: 1em;
    max-width: 100%;
    overflow-x: hidden;
    overflow-y: auto;
    font-size: 85%;
    line-height: 1.45;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
    background-color: #f7f7f7;
    border-radius: 6px;
    border: 1px solid #dddddd;
    page-break-inside: avoid;
}
pre code {
    padding: 0;
    margin: 0;
    white-space: inherit;
    background-color: transparent;
    border-radius: 0;
}
ul, ol {
    margin-top: 0;
    margin-bottom: 1em;
    padding-left: 2em;
}
li { margin-bottom: 0.25em; }
li::marker { color: #222222; font-weight: 600; }
li > p { margin-bottom: 0.5em; }
.task-list-item {
    list-style-type: none;
    margin-left: -1.5em;
}
.task-list-item-checkbox {
    margin-right: 0.5em;
    margin-left: 0.25em;
    accent-color: #222222;
    vertical-align: middle;
}
blockquote {
    margin: 0 0 1em 0;
    padding: 0 1em;
    color: #555555;
    border-left: 4px solid #dddddd;
    background-color: #f7f7f7;
    page-break-inside: avoid;
}
blockquote > :first-child { margin-top: 0; }
blockquote > :last-child { margin-bottom: 0; }
hr {
    height: 1px;
    padding: 0;
    margin: 1.5em 0;
    background-color: #e5e5e5;
    border: 0;
}
table {
    border-spacing: 0;
    border-collapse: collapse;
    margin-bottom: 1em;
    width: 100%;
    overflow: auto;
    page-break-inside: auto;
}
table th, table td {
    padding: 6px 13px;
    border: 1px solid #dddddd;
}
table th {
    font-weight: 600;
    color: #222222;
    background-color: #f7f7f7;
}
table thead {
    display: table-row-group;
}
table tr {
    background-color: #ffffff;
    border-top: 1px solid #dddddd;
    page-break-inside: avoid;
    page-break-after: auto;
}
table tr:nth-child(2n) { background-color: #fafafa; }
s, del {
    text-decoration: line-through;
    color: #666666;
}
img {
    max-width: 100%;
    max-height: 900px;
    object-fit: scale-down;
    box-sizing: border-box;
    background-color: #ffffff;
    border: 1px solid #dddddd;
    border-radius: 6px;
    page-break-inside: avoid;
}
.mermaid {
    background-color: #ffffff;
    padding: 16px;
    margin: 16px 0;
    border: 1px solid #dddddd;
    border-radius: 8px;
    text-align: center;
    overflow-x: auto;
    max-height: 900px;
    page-break-inside: avoid;
}
.mermaid svg {
    max-width: 100%;
    max-height: 868px;
    height: auto;
    background-color: #ffffff !important;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
}
@media print {
    body {
        max-width: none;
        padding: 0;
    }
}
"#;

fn percent_encode_file_url_path(path: &str) -> String {
    const HEX: &[u8; 16] = b"0123456789ABCDEF";
    let mut encoded = String::new();

    for byte in path.as_bytes() {
        match *byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b'/' | b':' => {
                encoded.push(*byte as char)
            }
            byte => {
                encoded.push('%');
                encoded.push(HEX[(byte >> 4) as usize] as char);
                encoded.push(HEX[(byte & 0x0f) as usize] as char);
            }
        }
    }

    encoded
}

fn path_to_file_url(path: &Path) -> String {
    let normalized = path.to_string_lossy().replace('\\', "/");

    if let Some(unc_path) = normalized.strip_prefix("//") {
        let mut parts = unc_path.splitn(2, '/');
        let host = parts.next().unwrap_or_default();
        let path = parts.next().unwrap_or_default();

        return format!("file://{}/{}", host, percent_encode_file_url_path(path));
    }

    let encoded = percent_encode_file_url_path(&normalized);
    if normalized.starts_with('/') {
        format!("file://{}", encoded)
    } else {
        format!("file:///{}", encoded)
    }
}

fn temporary_export_html_path() -> PathBuf {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);

    env::temp_dir().join(format!(
        "lightmarkit-pdf-{}-{}.html",
        process::id(),
        timestamp
    ))
}

#[tauri::command]
async fn export_html(file_path: String, html_content: String, title: String) -> Result<(), String> {
    let output_path = PathBuf::from(&file_path);
    ensure_export_file_path(&output_path, &["html", "htm"])?;
    let escaped_title = escape_html_text(&title);
    let full_html = format!(
        r#"<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{}</title>
    <style>{}</style>
</head>
<body>
    {}
</body>
</html>"#,
        escaped_title, EXPORT_DOCUMENT_STYLE, html_content
    );

    let temp_path = format!("{}.tmp", file_path);
    fs::write(&temp_path, full_html).map_err(|e| format!("Failed to write HTML file: {}", e))?;
    fs::rename(&temp_path, &file_path).map_err(|e| {
        let _ = fs::remove_file(&temp_path);
        format!("Failed to save HTML file: {}", e)
    })?;

    Ok(())
}

#[tauri::command]
async fn export_pdf(file_path: String, html_content: String, title: String) -> Result<(), String> {
    let output_path = PathBuf::from(&file_path);
    ensure_export_file_path(&output_path, &["pdf"])?;
    let escaped_title = escape_html_text(&title);
    let full_html = format!(
        r#"<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{}</title>
    <style>{}</style>
</head>
<body>
    {}
</body>
</html>"#,
        escaped_title, EXPORT_DOCUMENT_STYLE, html_content
    );

    let temp_html_path = temporary_export_html_path();
    fs::write(&temp_html_path, full_html)
        .map_err(|e| format!("Failed to write temporary HTML file: {}", e))?;
    let temp_html_url = path_to_file_url(&temp_html_path);

    let pdf_result = (|| -> Result<Vec<u8>, String> {
        let browser = Browser::new(LaunchOptions {
            headless: true,
            window_size: Some((PDF_VIEWPORT_WIDTH, PDF_VIEWPORT_HEIGHT)),
            ..Default::default()
        })
        .map_err(|e| format!("Failed to launch browser: {}", e))?;

        let tab = browser
            .new_tab()
            .map_err(|e| format!("Failed to create new tab: {}", e))?;

        tab.navigate_to(&temp_html_url)
            .map_err(|e| format!("Failed to navigate: {}", e))?;

        tab.wait_until_navigated()
            .map_err(|e| format!("Failed to wait for navigation: {}", e))?;

        tab.evaluate(
            r#"
            new Promise((resolve) => {
                const images = Array.from(document.images);

                if (images.length === 0) {
                    resolve(true);
                    return;
                }

                let pending = images.length;
                const done = () => {
                    pending -= 1;
                    if (pending <= 0) {
                        resolve(true);
                    }
                };

                images.forEach((image) => {
                    if (image.complete) {
                        done();
                    } else {
                        image.addEventListener('load', done, { once: true });
                        image.addEventListener('error', done, { once: true });
                    }
                });

                setTimeout(() => resolve(false), 5000);
            })
            "#,
            true,
        )
        .map_err(|e| format!("Failed to wait for images: {}", e))?;

        tab.evaluate(
            r#"
            new Promise((resolve) => {
                const mermaidEls = document.querySelectorAll('.mermaid');
                if (mermaidEls.length === 0) {
                    resolve();
                    return;
                }

                let checks = 0;
                const interval = setInterval(() => {
                    checks++;
                    const allDone = Array.from(mermaidEls).every(el => el.querySelector('svg'));
                    if (allDone || checks > 30) {
                        clearInterval(interval);
                        resolve();
                    }
                }, 200);
            })
            "#,
            true,
        )
        .map_err(|e| format!("Failed to wait for mermaid: {}", e))?;

        tab.evaluate(
            r#"
            new Promise((resolve) => {
                const PAGE_HEIGHT = 1046;
                const PAGE_GUTTER = 10;
                const PRINT_LAYOUT_SAFETY_GUTTER = 48;
                const PAGE_TOP_GRACE_RATIO = 0.1;
                const PAGE_BREAK_MIN_POSITION_RATIO = 0.25;
                const MIN_SCALE_TO_FIT_REMAINING = 0.7;

                document.body.style.maxWidth = 'none';
                document.body.style.padding = '0';

                function getAbsoluteTop(el) {
                    let top = 0;
                    let current = el;
                    while (current) {
                        top += current.offsetTop;
                        current = current.offsetParent;
                    }
                    return top;
                }

                function parsePixelValue(value) {
                    const parsed = parseFloat(value);
                    return Number.isFinite(parsed) ? parsed : 0;
                }

                function getVerticalMargins(el) {
                    const style = window.getComputedStyle(el);
                    return parsePixelValue(style.marginTop) + parsePixelValue(style.marginBottom);
                }

                function getBoxHeight(el) {
                    return el.getBoundingClientRect().height || el.offsetHeight;
                }

                function getBlockHeight(el) {
                    return getBoxHeight(el) + getVerticalMargins(el);
                }

                function resizeSvgToHeight(svg, maxHeight) {
                    const svgRect = svg.getBoundingClientRect();
                    const svgH = svgRect.height || parseFloat(svg.getAttribute('height')) || 0;
                    const svgW = svgRect.width || parseFloat(svg.getAttribute('width')) || 0;

                    if (!svgH || svgH <= maxHeight) {
                        return 1;
                    }

                    const scale = maxHeight / svgH;
                    const targetWidth = svgW * scale;

                    svg.setAttribute('height', String(maxHeight));
                    svg.style.height = maxHeight + 'px';
                    svg.style.maxWidth = '100%';

                    if (targetWidth > 0) {
                        svg.setAttribute('width', String(targetWidth));
                        svg.style.width = targetWidth + 'px';
                    }

                    return scale;
                }

                function scaleElementToBlockHeight(el, targetBlockHeight) {
                    const margins = getVerticalMargins(el);
                    const currentBoxHeight = getBoxHeight(el);
                    const targetBoxHeight = Math.max(1, targetBlockHeight - margins);

                    if (!currentBoxHeight || currentBoxHeight <= targetBoxHeight) {
                        return 1;
                    }

                    el.style.maxHeight = targetBoxHeight + 'px';

                    if (el.tagName === 'IMG') {
                        el.style.objectFit = 'scale-down';
                        el.style.height = 'auto';
                        return targetBoxHeight / currentBoxHeight;
                    }

                    const svg = el.querySelector('svg');
                    if (!svg) {
                        return 1;
                    }

                    const svgHeight = svg.getBoundingClientRect().height || parseFloat(svg.getAttribute('height')) || currentBoxHeight;
                    const frameHeight = Math.max(0, currentBoxHeight - svgHeight);
                    const maxSvgHeight = Math.max(1, targetBoxHeight - frameHeight);
                    const svgScale = resizeSvgToHeight(svg, maxSvgHeight);

                    el.style.overflow = 'hidden';

                    return Math.min(targetBoxHeight / currentBoxHeight, svgScale);
                }

                const elements = Array.from(document.querySelectorAll('img, .mermaid, pre, blockquote'));

                for (const el of elements) {
                    const top = getAbsoluteTop(el);
                    const height = getBlockHeight(el);
                    const posInPage = top % PAGE_HEIGHT;
                    const remaining = PAGE_HEIGHT - posInPage;
                    const availableHeight = remaining - PRINT_LAYOUT_SAFETY_GUTTER;

                    if (height <= availableHeight) continue;

                    const isScalable = el.tagName === 'IMG' || el.classList.contains('mermaid');
                    const isNearPageTop = posInPage <= PAGE_HEIGHT * PAGE_TOP_GRACE_RATIO;

                    if (isScalable) {
                        const requiredScale = availableHeight / height;

                        if (!isNearPageTop && requiredScale >= MIN_SCALE_TO_FIT_REMAINING) {
                            scaleElementToBlockHeight(el, availableHeight);
                            continue;
                        }

                        const fullPageHeight = PAGE_HEIGHT - PAGE_GUTTER;
                        if (height > fullPageHeight) {
                            scaleElementToBlockHeight(el, fullPageHeight);
                        }
                    }

                    if (!isNearPageTop && posInPage > PAGE_HEIGHT * PAGE_BREAK_MIN_POSITION_RATIO) {
                        el.style.breakBefore = 'page';
                        el.style.pageBreakBefore = 'always';
                    }
                }

                resolve(true);
            })
            "#,
            true,
        )
        .map_err(|e| format!("Failed to apply pagination: {}", e))?;

        tab.print_to_pdf(Some(PrintToPdfOptions {
            print_background: Some(true),
            paper_width: Some(PDF_PAPER_WIDTH_INCHES),
            paper_height: Some(PDF_PAPER_HEIGHT_INCHES),
            margin_top: Some(PDF_MARGIN_INCHES),
            margin_bottom: Some(PDF_MARGIN_INCHES),
            margin_left: Some(PDF_MARGIN_INCHES),
            margin_right: Some(PDF_MARGIN_INCHES),
            ..Default::default()
        }))
        .map_err(|e| format!("Failed to generate PDF: {}", e))
    })();

    let _ = fs::remove_file(&temp_html_path);
    let pdf_data = pdf_result?;

    let temp_path = format!("{}.tmp", file_path);
    fs::write(&temp_path, pdf_data).map_err(|e| format!("Failed to write PDF file: {}", e))?;
    fs::rename(&temp_path, &file_path).map_err(|e| {
        let _ = fs::remove_file(&temp_path);
        format!("Failed to save PDF file: {}", e)
    })?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let initial_file = initial_file_from_args();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(FileState {
            current_file: Mutex::new(initial_file),
        })
        .invoke_handler(tauri::generate_handler![
            file_read,
            file_write,
            read_image_as_data_url,
            get_current_file,
            set_current_file,
            scan_folder,
            export_html,
            export_pdf
        ])
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "隐藏窗口", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &hide, &quit])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "hide" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.hide();
                        }
                    }
                    "quit" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.close();
                        } else {
                            app.exit(0);
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_markdown_file_from_launch_arguments() {
        let path = markdown_file_arg_from_args(["LightMarkit.exe", "C:\\notes\\draft.md"]).unwrap();

        assert_eq!(path, PathBuf::from("C:\\notes\\draft.md"));
    }

    #[test]
    fn detects_markdown_extension_case_insensitively() {
        let path =
            markdown_file_arg_from_args(["LightMarkit.exe", "D:\\notes\\Draft.MARKDOWN"]).unwrap();

        assert_eq!(path, PathBuf::from("D:\\notes\\Draft.MARKDOWN"));
    }

    #[test]
    fn ignores_non_markdown_launch_arguments() {
        let path = markdown_file_arg_from_args([
            "LightMarkit.exe",
            "--flag",
            "C:\\notes\\image.png",
            "C:\\notes\\draft.md",
        ])
        .unwrap();

        assert_eq!(path, PathBuf::from("C:\\notes\\draft.md"));
    }

    #[test]
    fn converts_windows_path_to_file_url() {
        let url = path_to_file_url(Path::new(
            "C:\\Users\\Lenovo\\AppData\\Local\\Temp\\light markit export.html",
        ));

        assert_eq!(
            url,
            "file:///C:/Users/Lenovo/AppData/Local/Temp/light%20markit%20export.html"
        );
    }
}
