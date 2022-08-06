from os import environ
from random import SystemRandom
from string import ascii_uppercase, digits
from datetime import timedelta

class Config(object):
    SESSION_TYPE = 'filesystem'
    PERMANENT_SESSION_LIFETIME = environ.get('PERMANENT_SESSION_LIFETIME') or timedelta(hours=8)
    SESSION_PERMANENT = True

    FLASK_DEBUG = environ.get('FLASK_DEBUG') or "0"
    DEBUG = True if FLASK_DEBUG == "1" else False

    if DEBUG:
        SECRET_KEY = "DEBUG_SECRET_KEY"
    else:
        rnd_secret_key = ''.join(SystemRandom().choice(ascii_uppercase + digits) for _ in range(50))
        SECRET_KEY = environ.get('SECRET_KEY') or rnd_secret_key


    SQLALCHEMY_DATABASE_URI = "sqlite:///db/app.db"
    SQLALCHEMY_TRACK_MODIFICATIONS = False