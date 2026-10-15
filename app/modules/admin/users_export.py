"""Streaming CSV / JSON export of the admin user list.

Rows are fetched in batches on a session of the generator's own (a request
session is closed by the time a StreamingResponse body runs), so memory stays
flat however many rows match. Only the whitelisted columns below can ever be
written: no password hash, token or note leaves through here.
"""
import csv
import io
import json
import uuid
from datetime import datetime
from typing import AsyncIterator

from app.core import database
from app.modules.admin.users_repository import AdminUserRepository, user_status

EXPORT_ROW_CAP = 50_000
BATCH_SIZE = 1000
COLUMNS = (
    "id", "email", "username", "display_name", "status", "email_verified",
    "created_at", "last_login_at", "ratings_count", "lists_count", "comments_count",
)
COUNT_COLUMNS = {"ratings_count", "lists_count", "comments_count"}
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _value(user, counts: dict[str, int] | None, column: str):
    if column == "status":
        return user_status(user)
    if column == "email_verified":
        return user.email_verified_at is not None
    if column in COUNT_COLUMNS:
        return (counts or {}).get(column.removesuffix("_count"), 0)
    value = getattr(user, column)
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _csv_cell(value):
    # Spreadsheet formula injection: a text cell starting with = + - @ would run in Excel.
    if isinstance(value, str) and value.startswith(_FORMULA_PREFIXES):
        return "'" + value
    return "" if value is None else value


async def stream_export(
    *, filters: dict, ids: list[uuid.UUID] | None, sort: str, order: str, columns: list[str], fmt: str
) -> AsyncIterator[bytes]:
    need_counts = bool(COUNT_COLUMNS.intersection(columns))
    yielded_any = False

    if fmt == "csv":
        head = io.StringIO()
        csv.writer(head).writerow(columns)
        yield ("﻿" + head.getvalue()).encode("utf-8")  # BOM: Excel reads Persian text as UTF-8
    else:
        yield b"["

    async with database.background_read_session() as session:
        repo = AdminUserRepository(session)
        page = 1
        while True:
            users, _total = await repo.search(sort=sort, order=order, page=page, page_size=BATCH_SIZE, ids=ids, **filters)
            if not users:
                break
            counts = await repo.counts_for([u.id for u in users]) if need_counts else {}
            buf = io.StringIO()
            writer = csv.writer(buf)
            for user in users:
                values = {c: _value(user, counts.get(user.id), c) for c in columns}
                if fmt == "csv":
                    writer.writerow([_csv_cell(values[c]) for c in columns])
                else:
                    buf.write(("," if yielded_any else "") + json.dumps(values, ensure_ascii=False))
                yielded_any = True
            yield buf.getvalue().encode("utf-8")
            if len(users) < BATCH_SIZE:
                break
            page += 1

    if fmt == "json":
        yield b"]"
