"""
Transactional email. Provider is chosen by EMAIL_PROVIDER:
  - "smtp": any SMTP relay (SMTP_HOST/PORT/USER/PASSWORD, EMAIL_FROM)
  - "log" (default): nothing is sent; the message is logged. Fine for local dev.
"""
import asyncio
import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr

from app.config import settings

logger = logging.getLogger(__name__)


def email_enabled() -> bool:
    return settings.email_provider == "smtp" and bool(settings.smtp_host and settings.email_from)


def _send_smtp(to: str, subject: str, text: str, html: str | None) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((settings.email_from_name, settings.email_from))
    msg["To"] = to
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")

    if settings.smtp_use_ssl:
        server: smtplib.SMTP = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15)
    else:
        server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15)
    with server:
        if not settings.smtp_use_ssl and settings.smtp_starttls:
            server.starttls()
        if settings.smtp_user:
            server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(msg)


async def send_email(to: str, subject: str, text: str, html: str | None = None) -> bool:
    """Sends one email; never raises (callers run it in the background). Returns whether it was sent."""
    if not email_enabled():
        logger.info("Email not configured; would send to %s: %s", to, subject)
        return False
    try:
        await asyncio.to_thread(_send_smtp, to, subject, text, html)
        return True
    except Exception:
        logger.exception("Failed to send email to %s (%s)", to, subject)
        return False


def verification_email(link: str) -> tuple[str, str, str]:
    """(subject, text, html) of the confirm-your-address message."""
    hours = settings.email_verification_token_expire_hours
    subject = "تأیید ایمیل در سینماگزین"
    text = (
        "به سینماگزین خوش آمدید! برای تأیید ایمیل خود روی لینک زیر بزنید:\n"
        f"{link}\n\n"
        f"این لینک {hours} ساعت معتبر است. اگر شما ثبت‌نام نکرده‌اید، این پیام را نادیده بگیرید."
    )
    html = (
        '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.9;font-size:15px">'
        "<p>به سینماگزین خوش آمدید! برای تأیید ایمیل خود روی دکمهٔ زیر بزنید:</p>"
        f'<p><a href="{link}" style="display:inline-block;background:#E8B34A;color:#111;padding:10px 22px;'
        'border-radius:8px;text-decoration:none;font-weight:bold">تأیید ایمیل</a></p>'
        f'<p style="color:#666;font-size:13px">این لینک {hours} ساعت معتبر است. '
        "اگر شما ثبت‌نام نکرده‌اید، این پیام را نادیده بگیرید.</p>"
        "</div>"
    )
    return subject, text, html


def password_reset_email(link: str) -> tuple[str, str, str]:
    """(subject, text, html) of the password-reset message."""
    minutes = settings.password_reset_token_expire_minutes
    subject = "بازیابی رمز عبور سینماگزین"
    text = (
        "برای انتخاب رمز عبور جدید روی لینک زیر بزنید:\n"
        f"{link}\n\n"
        f"این لینک {minutes} دقیقه معتبر است. اگر شما درخواست بازیابی رمز نداده‌اید، این پیام را نادیده بگیرید."
    )
    html = (
        '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.9;font-size:15px">'
        "<p>برای انتخاب رمز عبور جدید روی دکمهٔ زیر بزنید:</p>"
        f'<p><a href="{link}" style="display:inline-block;background:#E8B34A;color:#111;padding:10px 22px;'
        'border-radius:8px;text-decoration:none;font-weight:bold">انتخاب رمز جدید</a></p>'
        f'<p style="color:#666;font-size:13px">این لینک {minutes} دقیقه معتبر است. '
        "اگر شما درخواست بازیابی رمز نداده‌اید، این پیام را نادیده بگیرید.</p>"
        "</div>"
    )
    return subject, text, html
