import bcrypt
from flask import Flask
from config import Config
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager

app = Flask(__name__)
app.config.from_object(Config)

db = SQLAlchemy(app)

login = LoginManager(app)
login.session_protection = "strong"
login.login_view = 'login'

from app import routes, models

db.create_all()
db.session.commit()

# Create admin user if no one in DB yet
user_count = db.session.query(models.User).count()
if user_count == 0:
    password = bcrypt.hashpw("3HNey93AkBW6CRbxV6xP".encode('utf-8'), bcrypt.gensalt())
    db.session.add(models.User(username="admin", password=password))
    db.session.commit()