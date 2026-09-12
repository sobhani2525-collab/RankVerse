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

    internal_api_key: str = ""

    ranking_min_votes: int = 50
    ranking_user_weight: float = 0.7
    ranking_external_weight: float = 0.3
    ranking_group_min_size: int = 5

    # Taste DNA dimension scoring (see app/modules/taste/compute.py). The
    # confidence shrinkage is the same v/(v+k) family as ranking_min_votes
    # above, just applied to one user's per-dimension sample size.
    taste_dimension_confidence_k: int = 10
    taste_dimension_rating_weight: float = 0.7
    taste_dimension_engagement_weight: float = 0.3
    taste_dimension_confidence_threshold: float = 0.35

    # Taste DNA anchor scoring (see TasteAnchorComputer in the same file).
    taste_anchor_min_rating: int = 8
    taste_anchor_rating_weight: float = 0.6
    taste_anchor_centrality_weight: float = 0.4
    taste_anchor_max_count: int = 6

    # Taste DNA snapshot scoring (see TasteSnapshotComputer in the same file).
    taste_snapshot_confidence_k: int = 15
    taste_snapshot_dimension_weight: float = 0.5
    taste_snapshot_vote_weight: float = 0.5
    taste_snapshot_label_dimension_count: int = 2

    # Taste DNA contribution scoring (see ContributionStatsComputer in the
    # same file). A battle vote and a written comment take more deliberate
    # effort than a single rating tap, hence the higher weights.
    taste_contribution_vote_weight: float = 1.0
    taste_contribution_battle_weight: float = 2.0
    taste_contribution_comment_weight: float = 3.0

    # Predicted picks (see PredictedPicksService in
    # app/modules/taste/predicted_picks.py): how much a candidate's match
    # score favors "fits your taste dimensions" vs. "is just good".
    # Should sum to 1.0.
    taste_predicted_picks_dimension_weight: float = 0.6
    taste_predicted_picks_ranking_weight: float = 0.4

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
