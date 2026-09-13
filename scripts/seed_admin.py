"""
Creates the first super_admin account in admin_accounts, or resets an
existing one's password with --reset. Separate from the `users` table —
this is platform-operator access, not a public profile.

The password is always generated (never accepted as an argument, so it
never ends up in shell history) and printed once. Once a real admin
"change password" flow exists (see PATCH /api/v1/admin/auth/password),
this script is only for the very first account or a lockout recovery.

Usage:
    python scripts/seed_admin.py --email admin@rankverse.app
    python scripts/seed_admin.py --email admin@rankverse.app --reset
"""
import argparse
import secrets
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import asyncio

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.modules.admin.repository import AdminAccountRepository
from app.modules.admin.models import AdminAccount


async def main(email: str, role: str, reset: bool) -> None:
    async with AsyncSessionLocal() as db:
        repo = AdminAccountRepository(db)
        admin = await repo.get_by_email(email)

        if admin and not reset:
            print(
                f"An admin account already exists for {email}. "
                "Pass --reset if you meant to change its password.",
                file=sys.stderr,
            )
            sys.exit(1)

        password = secrets.token_urlsafe(16)

        if admin:
            admin.password_hash = hash_password(password)
            admin.role = role
            admin.is_active = True
            action = "Reset password for"
        else:
            admin = AdminAccount(email=email, password_hash=hash_password(password), role=role)
            db.add(admin)
            action = "Created"

        await db.commit()

        print(f"{action} admin account: {email}")
        print(f"Password (shown once, not stored anywhere): {password}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--email", required=True)
    parser.add_argument("--role", default="super_admin")
    parser.add_argument("--reset", action="store_true", help="Reset the password of an existing account")
    args = parser.parse_args()

    asyncio.run(main(args.email, args.role, args.reset))
