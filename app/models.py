from sqlalchemy.inspection import inspect
from app import db, login
from flask_login import UserMixin
from sqlalchemy import exc


class BaseModel(db.Model):
    __abstract__ = True

    def serialize_me(self):
        return {c: getattr(self, c) for c in inspect(self).attrs.keys()}

    @staticmethod
    def serialize_list(l):
        return [m.serialize_me() for m in l]

    def serialize(self):
        d = self.serialize_me(self)
        return d

    def __getitem__(self, key):
        return getattr(self, key)


class User(UserMixin, BaseModel):
    __tablename__ = "admins"
    username = db.Column(db.String(255), nullable=False, index=True, unique=True, primary_key=True)
    password = db.Column(db.String(255), nullable=False)
    def get_id(self):
        return (self.username)


@login.user_loader
def load_user(username):
    try:
        return User.query.get(username)
    except exc.OperationalError as e:
        return None


class AccessLog(BaseModel):
    __tablename__ = "visits"
    requestId = db.Column(db.String(20), nullable=False, primary_key=True)
    visitorId = db.Column(db.String(20), nullable=False)
    visitorFound = db.Column(db.Boolean)
    time = db.Column(db.String(50), nullable=False)
    incognito = db.Column(db.Boolean, nullable=False)
    url = db.Column(db.String(4096), nullable=False)
    clientReferrer = db.Column(db.String(4096))
    ip = db.Column(db.String(40), nullable=False)
    accuracyRadius = db.Column(db.String(5))
    city = db.Column(db.String(4096), index=True)
    region = db.Column(db.String(250), index=True)
    country = db.Column(db.String(250), index=True)
    country_code = db.Column(db.String(10), index=True)
    timezone = db.Column(db.String(250))
    latitude = db.Column(db.String(10))
    longitude = db.Column(db.String(10))
    confidence = db.Column(db.String(5), index=True)
    browserName = db.Column(db.String(250))
    browserMajorVersion = db.Column(db.String(250))
    os = db.Column(db.String(250))
    osVersion = db.Column(db.String(250))
    device = db.Column(db.String(250))
    userAgent = db.Column(db.String(4096))
    firstSeenAt = db.Column(db.String(50))
    lastSeenAt = db.Column(db.String(50))


class BlockedVisitors(BaseModel):
    __tablename__ = "blocked"
    visitorId = db.Column(db.String(20), db.ForeignKey('visits.visitorId'), nullable=False, primary_key=True)
    blocked_at = db.Column(db.String(50), nullable=False)