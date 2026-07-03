use std::fs;
use std::path::{Path, PathBuf};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, State,
};
use serde::{Deserialize, Serialize};
use headless_chrome::{Browser, LaunchOptions};

// 文件状态管理
#[derive(Default)]
struct FileState {
    current_file: std::sync::Mutex<Option<PathBuf>>,
}

// 文件信息结构
#[derive(Debug, Clone, Serialize, Deserialize)]
struct FileInfo {
    name: String,
    path: String,
    is_dir: bool,
    children: Option<Vec<FileInfo>>,
}

// 读取文件内容
#[tauri::command]
async fn file_read(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

// 写入文件内容（原子写入）
#[tauri::command]
async fn file_write(path: String, content: String) -> Result<(), String> {
    // 创建临时文件路径
    let temp_path = format!("{}.tmp", path);

    // 先写入临时文件
    fs::write(&temp_path, content).map_err(|e| format!("Failed to write temp file: {}", e))?;

    // 原子性地重命名临时文件到目标文件
    fs::rename(&temp_path, &path).map_err(|e| {
        // 如果重命名失败，尝试删除临时文件
        let _ = fs::remove_file(&temp_path);
        format!("Failed to rename temp file: {}", e)
    })?;

    Ok(())
}

// 获取当前打开的文件路径
#[tauri::command]
async fn get_current_file(state: State<'_, FileState>) -> Result<Option<String>, String> {
    let current = state.current_file.lock().unwrap();
    Ok(current.as_ref().map(|p| p.to_string_lossy().to_string()))
}

// 设置当前打开的文件路径
#[tauri::command]
async fn set_current_file(path: Option<String>, state: State<'_, FileState>) -> Result<(), String> {
    let mut current = state.current_file.lock().unwrap();
    *current = path.map(PathBuf::from);
    Ok(())
}

// 扫描文件夹中的 Markdown 文件
#[tauri::command]
async fn scan_folder(folder_path: String) -> Result<Vec<FileInfo>, String> {
    let path = Path::new(&folder_path);
    if !path.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    fn scan_directory(dir_path: &Path) -> Result<Vec<FileInfo>, String> {
        let mut files = Vec::new();

        let entries = fs::read_dir(dir_path)
            .map_err(|e| format!("Failed to read directory: {}", e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();

            // 跳过隐藏文件和特殊目录
            if name.starts_with('.') || name == "node_modules" || name == "target" {
                continue;
            }

            if path.is_dir() {
                // 递归扫描子目录
                let children = scan_directory(&path)?;
                if !children.is_empty() {
                    files.push(FileInfo {
                        name,
                        path: path.to_string_lossy().to_string(),
                        is_dir: true,
                        children: Some(children),
                    });
                }
            } else if let Some(ext) = path.extension() {
                // 只包含 .md 和 .markdown 文件
                if ext == "md" || ext == "markdown" {
                    files.push(FileInfo {
                        name,
                        path: path.to_string_lossy().to_string(),
                        is_dir: false,
                        children: None,
                    });
                }
            }
        }

        // 按名称排序：目录优先，然后按字母顺序
        files.sort_by(|a, b| {
            match (a.is_dir, b.is_dir) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.name.cmp(&b.name),
            }
        });

        Ok(files)
    }

    scan_directory(path)
}

// 导出 HTML
#[tauri::command]
async fn export_html(file_path: String, html_content: String, title: String) -> Result<(), String> {
    // 创建完整的 HTML 文档
    let full_html = format!(
        r#"<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{}</title>
    <style>
        body {{
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
            font-size: 16px;
            line-height: 1.6;
            color: #1f2421;
            background-color: #fbf9f5;
        }}
        h1, h2, h3, h4, h5, h6 {{
            margin-top: 1.5em;
            margin-bottom: 0.5em;
            font-weight: 600;
            line-height: 1.25;
            color: #1f2421;
        }}
        h1 {{
            font-size: 2em;
            border-bottom: 1px solid #e7e1d7;
            padding-bottom: 0.3em;
        }}
        h2 {{
            font-size: 1.5em;
            border-bottom: 1px solid #e7e1d7;
            padding-bottom: 0.3em;
        }}
        h3 {{ font-size: 1.25em; }}
        h4 {{ font-size: 1em; }}
        h5 {{ font-size: 0.875em; }}
        h6 {{ font-size: 0.85em; color: #5c635d; }}
        p {{ margin-top: 0; margin-bottom: 1em; }}
        strong {{ font-weight: 600; }}
        em {{ font-style: italic; }}
        a {{ color: #c4612f; text-decoration: none; }}
        a:hover {{ color: #a94e22; text-decoration: underline; }}
        code {{
            padding: 0.2em 0.4em;
            margin: 0;
            font-size: 85%;
            background-color: rgba(196, 97, 47, 0.1);
            border-radius: 3px;
            font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
        }}
        pre {{
            padding: 1em;
            overflow: auto;
            font-size: 85%;
            line-height: 1.45;
            background-color: #f7f4ef;
            border-radius: 6px;
            border: 1px solid #e7e1d7;
        }}
        pre code {{
            padding: 0;
            margin: 0;
            background-color: transparent;
            border-radius: 0;
        }}
        ul, ol {{
            margin-top: 0;
            margin-bottom: 1em;
            padding-left: 2em;
        }}
        li {{ margin-bottom: 0.25em; }}
        li > p {{ margin-bottom: 0.5em; }}
        .task-list-item {{
            list-style-type: none;
            margin-left: -1.5em;
        }}
        .task-list-item-checkbox {{
            margin-right: 0.5em;
            margin-left: 0.25em;
            vertical-align: middle;
        }}
        blockquote {{
            margin: 0 0 1em 0;
            padding: 0 1em;
            color: #5c635d;
            border-left: 4px solid #c4612f;
            background-color: #f7f4ef;
        }}
        blockquote > :first-child {{ margin-top: 0; }}
        blockquote > :last-child {{ margin-bottom: 0; }}
        hr {{
            height: 1px;
            padding: 0;
            margin: 1.5em 0;
            background-color: #e7e1d7;
            border: 0;
        }}
        table {{
            border-spacing: 0;
            border-collapse: collapse;
            margin-bottom: 1em;
            width: 100%;
            overflow: auto;
        }}
        table th, table td {{
            padding: 6px 13px;
            border: 1px solid #e7e1d7;
        }}
        table th {{
            font-weight: 600;
            background-color: #f7f4ef;
        }}
        table tr {{
            background-color: #ffffff;
            border-top: 1px solid #e7e1d7;
        }}
        table tr:nth-child(2n) {{
            background-color: #fbf9f5;
        }}
        s, del {{
            text-decoration: line-through;
            color: #5c635d;
        }}
        img {{
            max-width: 100%;
            box-sizing: border-box;
            background-color: #ffffff;
            border-radius: 6px;
        }}
        .mermaid {{
            background-color: #ffffff;
            padding: 16px;
            margin: 16px 0;
            border: 1px solid #e7e1d7;
            border-radius: 8px;
            text-align: center;
        }}
    </style>
    <script type="module">
        import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
        mermaid.initialize({{ startOnLoad: true }});
    </script>
</head>
<body>
    {}
</body>
</html>"#,
        title, html_content
    );

    // 写入文件
    let temp_path = format!("{}.tmp", file_path);
    fs::write(&temp_path, full_html).map_err(|e| format!("Failed to write HTML file: {}", e))?;
    fs::rename(&temp_path, &file_path).map_err(|e| {
        let _ = fs::remove_file(&temp_path);
        format!("Failed to save HTML file: {}", e)
    })?;

    Ok(())
}

// 导出 PDF
#[tauri::command]
async fn export_pdf(file_path: String, html_content: String, title: String) -> Result<(), String> {
    // 创建完整的 HTML 文档（用于 PDF，不需要 Mermaid CDN）
    let full_html = format!(
        r#"<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{}</title>
    <style>
        body {{
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
            font-size: 16px;
            line-height: 1.6;
            color: #1f2421;
            background-color: #ffffff;
        }}
        h1, h2, h3, h4, h5, h6 {{
            margin-top: 1.5em;
            margin-bottom: 0.5em;
            font-weight: 600;
            line-height: 1.25;
            color: #1f2421;
            page-break-after: avoid;
        }}
        h1 {{
            font-size: 2em;
            border-bottom: 1px solid #e7e1d7;
            padding-bottom: 0.3em;
        }}
        h2 {{
            font-size: 1.5em;
            border-bottom: 1px solid #e7e1d7;
            padding-bottom: 0.3em;
        }}
        h3 {{ font-size: 1.25em; }}
        h4 {{ font-size: 1em; }}
        h5 {{ font-size: 0.875em; }}
        h6 {{ font-size: 0.85em; color: #5c635d; }}
        p {{ margin-top: 0; margin-bottom: 1em; }}
        strong {{ font-weight: 600; }}
        em {{ font-style: italic; }}
        a {{ color: #c4612f; text-decoration: none; }}
        code {{
            padding: 0.2em 0.4em;
            margin: 0;
            font-size: 85%;
            background-color: rgba(196, 97, 47, 0.1);
            border-radius: 3px;
            font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
        }}
        pre {{
            padding: 1em;
            overflow: auto;
            font-size: 85%;
            line-height: 1.45;
            background-color: #f7f4ef;
            border-radius: 6px;
            border: 1px solid #e7e1d7;
            page-break-inside: avoid;
        }}
        pre code {{
            padding: 0;
            margin: 0;
            background-color: transparent;
            border-radius: 0;
        }}
        ul, ol {{
            margin-top: 0;
            margin-bottom: 1em;
            padding-left: 2em;
        }}
        li {{ margin-bottom: 0.25em; }}
        li > p {{ margin-bottom: 0.5em; }}
        .task-list-item {{
            list-style-type: none;
            margin-left: -1.5em;
        }}
        .task-list-item-checkbox {{
            margin-right: 0.5em;
            margin-left: 0.25em;
            vertical-align: middle;
        }}
        blockquote {{
            margin: 0 0 1em 0;
            padding: 0 1em;
            color: #5c635d;
            border-left: 4px solid #c4612f;
            background-color: #f7f4ef;
            page-break-inside: avoid;
        }}
        blockquote > :first-child {{ margin-top: 0; }}
        blockquote > :last-child {{ margin-bottom: 0; }}
        hr {{
            height: 1px;
            padding: 0;
            margin: 1.5em 0;
            background-color: #e7e1d7;
            border: 0;
        }}
        table {{
            border-spacing: 0;
            border-collapse: collapse;
            margin-bottom: 1em;
            width: 100%;
            page-break-inside: avoid;
        }}
        table th, table td {{
            padding: 6px 13px;
            border: 1px solid #e7e1d7;
        }}
        table th {{
            font-weight: 600;
            background-color: #f7f4ef;
        }}
        table tr {{
            background-color: #ffffff;
            border-top: 1px solid #e7e1d7;
        }}
        table tr:nth-child(2n) {{
            background-color: #fbf9f5;
        }}
        s, del {{
            text-decoration: line-through;
            color: #5c635d;
        }}
        img {{
            max-width: 100%;
            box-sizing: border-box;
            page-break-inside: avoid;
        }}
        .mermaid {{
            background-color: #ffffff;
            padding: 16px;
            margin: 16px 0;
            border: 1px solid #e7e1d7;
            border-radius: 8px;
            text-align: center;
            page-break-inside: avoid;
        }}
        @media print {{
            body {{
                max-width: none;
                padding: 0;
            }}
        }}
    </style>
</head>
<body>
    {}
</body>
</html>"#,
        title, html_content
    );

    // 启动无头浏览器
    let browser = Browser::new(LaunchOptions {
        headless: true,
        ..Default::default()
    })
    .map_err(|e| format!("Failed to launch browser: {}", e))?;

    let tab = browser
        .new_tab()
        .map_err(|e| format!("Failed to create new tab: {}", e))?;

    // 加载 HTML 内容
    tab.navigate_to(&format!("data:text/html,{}", urlencoding::encode(&full_html)))
        .map_err(|e| format!("Failed to navigate: {}", e))?;

    // 等待页面加载完成
    tab.wait_until_navigated()
        .map_err(|e| format!("Failed to wait for navigation: {}", e))?;

    // 等待额外时间以确保所有内容渲染完成
    std::thread::sleep(std::time::Duration::from_secs(1));

    // 生成 PDF
    let pdf_data = tab
        .print_to_pdf(None)
        .map_err(|e| format!("Failed to generate PDF: {}", e))?;

    // 写入文件
    let temp_path = format!("{}.tmp", file_path);
    fs::write(&temp_path, pdf_data).map_err(|e| format!("Failed to write PDF file: {}", e))?;
    fs::rename(&temp_path, &file_path).map_err(|e| {
        let _ = fs::remove_file(&temp_path);
        format!("Failed to save PDF file: {}", e)
    })?;

    Ok(())
}

// 导出 Markdown（标准化格式）
#[tauri::command]
async fn export_markdown(file_path: String, content: String) -> Result<(), String> {
    // 标准化 Markdown 格式
    let formatted_content = format_markdown(&content);

    // 写入文件
    let temp_path = format!("{}.tmp", file_path);
    fs::write(&temp_path, formatted_content)
        .map_err(|e| format!("Failed to write Markdown file: {}", e))?;
    fs::rename(&temp_path, &file_path).map_err(|e| {
        let _ = fs::remove_file(&temp_path);
        format!("Failed to save Markdown file: {}", e)
    })?;

    Ok(())
}

// 格式化 Markdown 内容
fn format_markdown(content: &str) -> String {
    // 简单的格式化：确保一致的换行和空行
    let lines: Vec<&str> = content.lines().collect();
    let mut formatted = String::new();
    let mut prev_line_empty = false;

    for line in lines {
        let trimmed = line.trim_end();
        let is_empty = trimmed.is_empty();

        // 避免连续多个空行
        if is_empty && prev_line_empty {
            continue;
        }

        formatted.push_str(trimmed);
        formatted.push('\n');
        prev_line_empty = is_empty;
    }

    formatted
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(FileState::default())
        .invoke_handler(tauri::generate_handler![
            file_read,
            file_write,
            get_current_file,
            set_current_file,
            scan_folder,
            export_html,
            export_pdf,
            export_markdown
        ])
        .setup(|app| {
            // 创建托盘菜单
            let show = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "隐藏窗口", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &hide, &quit])?;

            // 创建托盘图标
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
                        app.exit(0);
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
