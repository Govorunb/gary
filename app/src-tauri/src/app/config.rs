

#[derive(Debug, Clone)]
pub struct Config {
    pub server_port: u16,
    pub auto_start_server: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            server_port: 8000,
            auto_start_server: true,
        }
    }
}
