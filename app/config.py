from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    secret_key: str = "dev-secret-key-change-in-production"
    claude_api_key: str = ""
    gemini_api_key: str = ""
    ai_provider: str = "gemini"
    google_client_id: str = ""
    google_client_secret: str = ""
    mp_client_id: str = ""
    mp_client_secret: str = ""
    app_url: str = "http://localhost:8000"
    port: int = 8000
    demo_mode: bool = True

    @property
    def claude_enabled(self) -> bool:
        return bool(self.claude_api_key)

    @property
    def gemini_enabled(self) -> bool:
        return bool(self.gemini_api_key)

    @property
    def gmail_enabled(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)

    @property
    def mp_enabled(self) -> bool:
        return bool(self.mp_client_id and self.mp_client_secret)

    @property
    def ai_enabled(self) -> bool:
        if self.ai_provider == "claude":
            return self.claude_enabled
        return self.gemini_enabled

    model_config = {"env_file": ".env", "case_sensitive": False}

@lru_cache()
def get_settings() -> Settings:
    return Settings()
