"""
Django settings for backend project.
"""
from pathlib import Path
import os
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = "django-insecure-*la-va@b(5t7)kmo+om$&0d0prlhh@qaztwr+3!26dgsa@quuv"
DEBUG = True
ALLOWED_HOSTS = ["localhost", "127.0.0.1", ".vercel.app", "your-backend-domain.com"]

# ===============================================
# DATABASE - Using Supabase Transaction Pooler
# ===============================================

print("=" * 60)
print("DATABASE CONFIGURATION")
print("=" * 60)

# Get password from environment
POSTGRES_PASSWORD = os.getenv('POSTGRES_PASSWORD')

if POSTGRES_PASSWORD:
    print(f"[INFO] Password found (length: {len(POSTGRES_PASSWORD)})")
    
    # HARDCODED for Supabase Transaction Pooler (IPv4-compatible)
    # Using pgbouncer in transaction mode
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': 'postgres',
            'USER': 'postgres.mxwhovimordatihksosb',
            'PASSWORD': POSTGRES_PASSWORD,
            'HOST': 'aws-1-us-east-1.pooler.supabase.com',
            'PORT': '6543',
            'CONN_MAX_AGE': 0,  # CRITICAL: Must be 0 for pgbouncer transaction mode
            'DISABLE_SERVER_SIDE_CURSORS': True,  # CRITICAL: Required for pgbouncer
            'OPTIONS': {
                'sslmode': 'require',
                'connect_timeout': 10,
                # pgbouncer transaction mode settings
                'options': '-c statement_timeout=30000 -c idle_in_transaction_session_timeout=30000',
            }
        }
    }
    
    print("[SUCCESS] Database configured for Supabase Transaction Pooler")
    print(f"  - Host: aws-1-us-east-1.pooler.supabase.com:6543")
    print(f"  - User: postgres.mxwhovimordatihksosb")
    print(f"  - Mode: Transaction pooling (pgbouncer)")
else:
    print("[WARNING] POSTGRES_PASSWORD not found - using SQLite")
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

print("=" * 60)
print()

# Application definition
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "driver_log",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "backend.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "backend.wsgi.application"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# CORS Settings
CORS_ALLOW_ALL_ORIGINS = True