#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Public catalogue traffic uses a URL-scoped Rust client so the release
        // does not depend on WebView CORS behavior. The capability allows only
        // the publisher's GitHub Pages host class and exposes no request secrets.
        .plugin(tauri_plugin_http::init())
        // Provider handoff only opens an HTTPS URL in the user's external
        // browser. No embedded provider page or cookie API is present.
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
