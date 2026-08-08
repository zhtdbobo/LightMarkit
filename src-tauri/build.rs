fn main() {
    #[cfg(target_os = "macos")]
    cc::Build::new()
        .file("src/macos_pdf.m")
        .flag("-fobjc-arc")
        .compile("lightmarkit_macos_pdf");

    #[cfg(target_os = "macos")]
    {
        println!("cargo:rustc-link-lib=framework=WebKit");
        println!("cargo:rustc-link-lib=framework=Cocoa");
    }

    tauri_build::build()
}
