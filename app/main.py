from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.exceptions import RankVerseError, rankverse_exception_handler

app = FastAPI(
    title="RankVerse Core Engine",
    description="Knowledge-graph-based ranking platform for cultural entities (movies, books, music...)",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,    
    allow_origins=["https://rankverse-frontend.sobhani2525.workers.dev"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(RankVerseError, rankverse_exception_handler)

app.include_router(api_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
