import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.admin.models import AdminAccount


class AdminAccountRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_email(self, email: str) -> AdminAccount | None:
        result = await self.db.execute(select(AdminAccount).where(AdminAccount.email == email))
        return result.scalar_one_or_none()

    async def get_by_id(self, admin_id: uuid.UUID) -> AdminAccount | None:
        return await self.db.get(AdminAccount, admin_id)

    async def mark_logged_in(self, admin: AdminAccount) -> None:
        admin.last_login_at = datetime.now(timezone.utc)
        await self.db.flush()

    async def update_password(self, admin: AdminAccount, password_hash: str) -> None:
        admin.password_hash = password_hash
        await self.db.flush()
