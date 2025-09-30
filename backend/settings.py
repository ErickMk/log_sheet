"""
Django settings for backend project.
"""
from pathlib import Path
import os
import re
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = "django-insecure-*la-va@b(5t7)kmo+om$&0d0prlhh@qaztwr+3!26dgsa@quuv"
DEBUG = True
ALLOWED_HOSTS = ["localhost", "127.0.0.1", ".vercel.app", "your-backend-domain.com"]

# ===============================================
# DATABASE CONFIGURATION
# ===============================================

print("=" * 60)
print("DATABASE CONFIGURATION")
print("=" * 60)

# Get DATABASE_URL from environment (Neon connection string)
DATABASE_URL = os.getenv('DATABASE_URL')

if DATABASE_URL:
    print(f"[INFO] DATABASE_URL found")
    
    # Parse the connection URL
    # Format: postgresql://user:password@host:port/database
    match = re.match(r'postgres(?:ql)?://([^:]+):([^@]+)@([^:]+):(\d+)/([^?]+)', DATABASE_URL)
    
    if match:
        db_user = match.group(1)
        db_password = match.group(2)
        db_host = match.group(3)
        db_port = match.group(4)
        db_name = match.group(5)
        
        print(f"  User: {db_user}")
        print(f"  Host: {db_host}")
        print(f"  Port: {db_port}")
        print(f"  Database: {db_name}")
        
        DATABASES = {
            'default': {
                'ENGINE': 'django.db.backends.postgresql',
                'NAME': db_name,
                'USER': db_user,
                'PASSWORD': db_password,
                'HOST': db_host,
                'PORT': db_port,
                'CONN_MAX_AGE': 0,  # Serverless-friendly
                'OPTIONS': {
                    'sslmode': 'require',
                    'connect_timeout': 10,
                }
            }
        }
        
        print("[SUCCESS] Database configured from DATABASE_URL")
    else:
        print("[ERROR] Could not parse DATABASE_URL")
        DATABASES = {
            'default': {
                'ENGINE': 'django.db.backends.sqlite3',
                'NAME': BASE_DIR / 'db.sqlite3',
            }
        }
else:
    print("[WARNING] DATABASE_URL not found - using SQLite")
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

print("=" * 60)
print()

# ===============================================
# END DATABASE CONFIGURATION
# ===============================================

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