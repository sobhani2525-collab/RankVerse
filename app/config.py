from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    environment: str = "development"

    database_url: str
    redis_url: str = "redis://localhost:6379/0"

    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30

    tmdb_api_key: str = ""
    tmdb_base_url: str = "https://api.themoviedb.org/3"

    ranking_min_votes: int = 50
    ranking_user_weight: float = 0.7
    ranking_external_weight: float = 0.3

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
