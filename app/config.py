from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    environment: str = "development"

    database_url: str
    redis_url: str = "redis://localhost:6379/0"

    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30
    admin_access_token_expire_minutes: int = 30
    password_reset_token_expire_minutes: int = 30

    # Used to build the link inside a password-reset email. No transactional
    # email provider is wired up yet (see UserService.request_password_reset)
    # -- override via env for whichever origin should receive the click.
    frontend_base_url: str = "http://localhost:3000"

    tmdb_api_key: str = ""
    tmdb_base_url: str = "https://api.themoviedb.org/3"
    # TMDb credits TV directing per episode, so a long-running show can have
    # dozens of one-off episode directors. Only people who directed at least
    # this share of a series' episodes get a directed_by edge (see
    # normalizer.select_tv_directors); if nobody clears it, the single
    # most-prolific director is kept so the series isn't left without one.
    tv_director_min_episode_ratio: float = 0.2

    internal_api_key: str = ""

    # NOTE on the 1-5 rating scale (migrated from 1-10, see
    # alembic/versions/*_rescale_user_ratings_to_five_stars.py): every
    # constant below that is a *count* threshold (how many votes/samples
    # before we trust the data) is intentionally left unchanged by that
    # migration. ranking_min_votes/taste_dimension_confidence_k/
    # taste_snapshot_confidence_k/list_item_score_k all gate the Bayesian
    # v/(v+k) shrinkage on the NUMBER of ratings collected, not on the
    # numeric range those ratings fall in -- 50 votes still means "50
    # votes' worth of evidence" whether each vote is worth 1-10 or 1-5, so
    # there is no statistical reason to retune them for the new scale.
    # The one constant that DOES need rescaling is taste_anchor_min_rating
    # below, because it's a literal cutoff expressed in raw rating units
    # (score >= N), not a sample count.
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

    # A ♥ favorite (UserFavorite) is a deliberately weaker, implicit signal
    # than an explicit UserRating -- see TasteDimensionComputer's
    # _favorited_unrated_genre_slugs_for_user. When a favorited entity
    # hasn't also been rated, its genres get one extra data point worth
    # this many stars (out of RATING_SCALE_MAX in taste/compute.py) rather
    # than a real score; an entity the user has explicitly rated always
    # uses that rating instead, never both.
    taste_favorite_rating_equivalent: int = 4

    # Taste DNA anchor scoring (see TasteAnchorComputer in the same file).
    # taste_anchor_min_rating is expressed in raw UserRating.score units
    # (RATING_SCALE_MIN..RATING_SCALE_MAX in taste/compute.py), so it was
    # rescaled from 8 (out of the old 1-10 range) to 4 (out of the current
    # 1-5 range) via the same round-half-up rule the data migration uses,
    # to keep "counts as a taste anchor" meaning the same relative bar
    # (roughly the top two rating values) on the new scale.
    taste_anchor_min_rating: int = 4
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
    # effort than a single rating tap, hence the higher weights. A ♥
    # favorite is a single tap with even less deliberation than a rating
    # (no score to choose), hence the lowest weight of the four.
    taste_contribution_vote_weight: float = 1.0
    taste_contribution_battle_weight: float = 2.0
    taste_contribution_comment_weight: float = 3.0
    taste_contribution_favorite_weight: float = 0.5

    # Predicted picks (see PredictedPicksService in
    # app/modules/taste/predicted_picks.py): how much a candidate's match
    # score favors "fits your taste dimensions" vs. "is just good".
    # Should sum to 1.0.
    taste_predicted_picks_dimension_weight: float = 0.6
    taste_predicted_picks_ranking_weight: float = 0.4

    # Community-ordered list item scoring (see app/modules/lists/scoring.py):
    # a Bayesian-average shrinkage of the like/dislike ratio toward a global
    # prior, same v/(v+k) family as ranking_min_votes above. K is how many
    # votes it takes for an item's own ratio to outweigh the prior.
    list_item_score_k: float = 5.0
    list_item_score_global_avg: float = 0.5

    # Smart graph-based list-item suggestions (see
    # ListService.get_smart_suggestions): a real-time aggregate over the
    # existing relationships graph for a list's current items, not the
    # heavier batch recommendation engine. min_shared_items is how many of
    # the list's items must share a (relation_type, target) edge before it
    # counts as a signal; relation_priority (comma-separated, most
    # important first) picks which relation wins when several qualify --
    # e.g. a shared director outranks a shared genre even if more items
    # share the genre, since genre overlap is common and a weak signal by
    # comparison. shared_count only breaks ties within the same priority.
    list_suggestion_min_shared_items: int = 2
    list_suggestion_limit: int = 6
    list_suggestion_relation_priority: str = (
        "directed_by,creator,has_genre,acted_in,performed_by,part_of,aired_on,similar_to"
    )

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
