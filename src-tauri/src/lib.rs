use std::fs;
use std::path::PathBuf;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, State,
};

// 文件状态管理
#[derive(Default)]
struct FileState {
    current_file: std::sync::Mutex<Option<PathBuf>>,
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
            set_current_file
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
