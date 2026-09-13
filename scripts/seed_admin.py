"""
Creates (or updates the password of) a super_admin account in admin_accounts.
Separate from the `users` table — this is platform-operator access, not a
public profile.

Usage:
    python scripts/seed_admin.py --email admin@rankverse.app --password "..."

If an account with that email already exists, its password is reset and it
is reactivated instead of failing.
"""
import argparse
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import asyncio

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.modules.admin.repository import AdminAccountRepository
from app.modules.admin.models import AdminAccount


async def main(email: str, password: str, role: str) -> None:
    async with AsyncSessionLocal() as db:
        repo = AdminAccountRepository(db)
        admin = await repo.get_by_email(email)
        if admin:
            admin.password_hash = hash_password(password)
            admin.role = role
            admin.is_active = True
            print(f"Updated existing admin account: {email}")
        else:
            admin = AdminAccount(
                email=email,
                password_hash=hash_password(password),
                role=role,
            )
            db.add(admin)
            print(f"Created new admin account: {email}")
        await db.commit()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--role", default="super_admin")
    args = parser.parse_args()

    asyncio.run(main(args.email, args.password, args.role))
