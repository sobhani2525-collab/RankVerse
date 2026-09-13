from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import UnauthorizedError
from app.core.security import create_admin_access_token, verify_password
from app.modules.admin.repository import AdminAccountRepository
from app.modules.admin.schemas import AdminLogin, AdminPublic, AdminTokenResponse


class AdminAuthService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = AdminAccountRepository(db)

    async def login(self, payload: AdminLogin) -> AdminTokenResponse:
        admin = await self.repo.get_by_email(payload.email)
        if not admin or not verify_password(payload.password, admin.password_hash):
            raise UnauthorizedError("Invalid email or password")
        if not admin.is_active:
            raise UnauthorizedError("This admin account is disabled")

        await self.repo.mark_logged_in(admin)
        await self.db.commit()

        return AdminTokenResponse(
            access_token=create_admin_access_token(str(admin.id)),
            admin=AdminPublic.model_validate(admin),
        )
