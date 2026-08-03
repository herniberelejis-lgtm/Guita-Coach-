from pydantic_settings import BaseSettings
from pydantic import field_validator
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
    plaid_client_id: str = ""
    plaid_secret: str = ""
    plaid_env: str = "sandbox"
    plaid_country_codes: str = "AR"
    prometeo_api_key: str = ""
    prometeo_secret_key: str = ""
    prometeo_env: str = "sandbox"
    app_url: str = "http://localhost:8000"
    port: int = 8000
    demo_mode: bool = False  # nunca por defecto: debe activarse a propósito (fail-closed)
    live_prices: bool = True  # obtener precios de mercado en tiempo real (Yahoo/CoinGecko)
    database_url: str = ""  # postgres en prod (Railway inyecta DATABASE_URL); vacío = sqlite local

    @field_validator("app_url")
    @classmethod
    def _normalize_app_url(cls, v: str) -> str:
        """Saca la barra final y espacios de APP_URL.

        Todos los redirect_uri de OAuth se arman como f"{app_url}/api/auth/...".
        Si APP_URL viene con barra al final ("https://guitacoach.com/"), queda
        una doble barra en el medio y Google/Mercado Pago lo rechazan con
        redirect_uri_mismatch, que es muy difícil de ver a simple vista.
        """
        return v.strip().rstrip("/")

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
    def plaid_enabled(self) -> bool:
        return bool(self.plaid_client_id and self.plaid_secret)

    @property
    def prometeo_enabled(self) -> bool:
        return bool(self.prometeo_api_key)  # Solo necesita API Key

    @property
    def ai_enabled(self) -> bool:
        if self.ai_provider == "claude":
            return self.claude_enabled
        return self.gemini_enabled

    @property
    def secret_key_is_default(self) -> bool:
        return self.secret_key == "dev-secret-key-change-in-production"

    model_config = {"env_file": ".env", "case_sensitive": False}

@lru_cache()
def get_settings() -> Settings:
    return Settings()
