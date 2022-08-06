from pprint import pprint
from queue import Empty
from app.models import AccessLog, BlockedVisitors, User
from sqlalchemy import and_, not_, or_
from itertools import groupby
from operator import itemgetter
from sqlalchemy import exc
import json
import re
import time
import bcrypt
import datetime     # for general datetime object handling
import rfc3339      # for date object -> date string
import iso8601      # for date string -> date object
from app import app, db
from sqlalchemy.engine.default import DefaultDialect
from sqlalchemy.sql.sqltypes import String, DateTime, NullType
from sqlalchemy.ext.declarative import DeclarativeMeta

class AlchemyEncoder(json.JSONEncoder):

    def default(self, obj):
        if isinstance(obj.__class__, DeclarativeMeta):
            # an SQLAlchemy class
            fields = {}
            for field in [x for x in dir(obj) if not x.startswith('_') and x != 'metadata']:
                data = obj.__getattribute__(field)
                try:
                    json.dumps(data) # this will fail on non-encodable values, like other classes
                    fields[field] = data
                except TypeError:
                    continue
            # a json-encodable dict
            return fields

        return json.JSONEncoder.default(self, obj)

class StringLiteral(String):
    """Teach SA how to literalize various things."""
    def literal_processor(self, dialect):
        super_processor = super(StringLiteral, self).literal_processor(dialect)

        def process(value):
            if isinstance(value, int):
                return str(value)
            if not isinstance(value, str):
                value = str(value)
            result = super_processor(value)
            if isinstance(result, bytes):
                result = result.decode(dialect.encoding)
            return result
        return process


class LiteralDialect(DefaultDialect):
    colspecs = {
        # prevent various encoding explosions
        String: StringLiteral,
        # teach SA about how to literalize a datetime
        DateTime: StringLiteral,
        # don't format py2 long integers to NULL
        NullType: StringLiteral,
    }


def check_user_credentials(username, password):
    try:
        user = User.query\
            .filter(User.username == username)\
            .first()
    except exc.OperationalError as e:
        return None, False

    if user is None or not check_password_hash(password, user.password):
        return None, False
    else:
        return user, True


def check_password_hash(password, password_hash):
    passw = password.encode('utf-8')
    try:
        return bcrypt.hashpw(passw, password_hash) == password_hash
    except:
        return False


def get_date_object(date_string):
  return iso8601.parse_date(date_string)


def get_date_string(date_object):
  return rfc3339.rfc3339(date_object)


def insert_access_entry(visit_data):
    empty_json = json.loads('{}')

    log_entry = AccessLog()
    log_entry.requestId = visit_data.get('requestId')
    log_entry.visitorId = visit_data.get('visitorId')
    log_entry.visitorFound = visit_data.get('visitorFound', False)
    log_entry.time = get_date_object(visit_data.get('time')).replace(tzinfo=None) if visit_data.get('time') != None else ''
    log_entry.incognito = visit_data.get('incognito', False)
    log_entry.url = visit_data.get('url', '')
    log_entry.clientReferrer = visit_data.get('clientReferrer', '')
    log_entry.ip = visit_data.get('ip')
    ipLocation = visit_data.get('ipLocation') if visit_data.get('ipLocation') != None else empty_json
    log_entry.accuracyRadius = ipLocation.get('accuracyRadius', '')
    log_entry.timezone = ipLocation.get('timezone', '')
    log_entry.latitude = ipLocation.get('latitude', '')
    log_entry.longitude = ipLocation.get('longitude', '')

    log_entry.city = (ipLocation.get('city') if ipLocation.get('city') != None else empty_json).get('name', '')
    log_entry.region = (ipLocation.get('subdivisions')[0] if ipLocation.get('subdivisions') != None else empty_json).get('name', '')
    log_entry.country = (ipLocation.get('country') if ipLocation.get('country') != None else empty_json).get('name', '')
    log_entry.country_code = (ipLocation.get('country') if ipLocation.get('country') != None else empty_json).get('code', '')

    log_entry.confidence = (visit_data.get('confidence') if visit_data.get('confidence') != None else empty_json).get('score', '0')

    browserDetails = visit_data.get('browserDetails') if visit_data.get('browserDetails') != None else empty_json
    log_entry.browserName = browserDetails.get('browserName', '')
    log_entry.browserMajorVersion = browserDetails.get('browserMajorVersion', '')
    log_entry.os = browserDetails.get('os', '')
    log_entry.osVersion = browserDetails.get('osVersion', '')
    log_entry.device = browserDetails.get('device', '')
    log_entry.userAgent = browserDetails.get('userAgent', '')

    firstSeenAt = (visit_data.get('firstSeenAt') if visit_data.get('firstSeenAt') != None else empty_json).get('subscription')
    lastSeenAt = (visit_data.get('lastSeenAt') if visit_data.get('lastSeenAt') != None else empty_json).get('subscription')
    log_entry.firstSeenAt = get_date_object(firstSeenAt).replace(tzinfo=None) if firstSeenAt != None else ''
    log_entry.lastSeenAt = get_date_object(lastSeenAt).replace(tzinfo=None) if lastSeenAt != None else ''
    
    db.session.add(log_entry);
    db.session.commit();


def visits_data(date_start, date_end):
    try:
        DEBUG = app.config["DEBUG"]

        if DEBUG:
            start_time = time.time()

        # Get visits records
        visits_query = AccessLog.query \
            .with_hint(AccessLog,"FORCE INDEX (time)") \
            .filter(AccessLog.time.between(date_start, date_end)) \
            .distinct(AccessLog.time) \
            .order_by(AccessLog.time.desc())

        visits_data = visits_query.all()

        if DEBUG:
            statement = visits_query.statement
            raw_text_sql=statement.compile(
                dialect=LiteralDialect(),
                compile_kwargs={'literal_binds': True},
            ).string
            #print("Calls data SQL: " + raw_text_sql.replace("\n", ""))

            print("--- SQL (Get visits data) execution time %s seconds ---" % (time.time() - start_time))

    except exc.OperationalError as e:
        raise

    if DEBUG:
        start_time = time.time()
        print(start_time)

    #grouped_visits_data = {k:list(v) for k,v in groupby(visits_data,key=itemgetter("visitorId"))}

    #if DEBUG:
    #    print("--- Data grouping execution time %s seconds ---" % (time.time() - start_time))

    visits_data_raw = json.loads(json.dumps(visits_data, cls=AlchemyEncoder, indent=4, sort_keys=True))
    blocked_visitors_data_raw = json.loads(blocked_visitors_data())

    blocked_visitors_ids = []
    for blocked_visitor in blocked_visitors_data_raw:
        blocked_visitors_ids.append(blocked_visitor['visitorId'])

    for visit in visits_data_raw:
        if visit['visitorId'] in blocked_visitors_ids:
            visit['visitorBlocked'] = True
        else:
            visit['visitorBlocked'] = False
    
    visits_data_json = json.dumps(visits_data_raw, cls=AlchemyEncoder, indent=4, sort_keys=True)    
    blocked_visitors_data_json = json.dumps(blocked_visitors_data_raw, indent=4, sort_keys=True)

    #groupped_visits_data_json = json.dumps(grouped_visits_data, cls=AlchemyEncoder, indent=4, sort_keys=True)

    return visits_data_json, blocked_visitors_data_json

def blocked_visitors_data():
    try:
        DEBUG = app.config["DEBUG"]

        if DEBUG:
            start_time = time.time()

        # Get visits records
        blocked_visitors_query = BlockedVisitors.query \
            .with_hint(BlockedVisitors,"FORCE INDEX (blocked_at)") \
            .distinct(BlockedVisitors.blocked_at) \
            .order_by(BlockedVisitors.blocked_at.desc())

        blocked_visitors_data = blocked_visitors_query.all()

        if DEBUG:
            statement = blocked_visitors_query.statement
            raw_text_sql=statement.compile(
                dialect=LiteralDialect(),
                compile_kwargs={'literal_binds': True},
            ).string
            #print("Calls data SQL: " + raw_text_sql.replace("\n", ""))

            print("--- SQL (Get blocked visitors data) execution time %s seconds ---" % (time.time() - start_time))

    except exc.OperationalError as e:
        raise

    blocked_visitors_data_json = json.dumps(blocked_visitors_data, cls=AlchemyEncoder, indent=4, sort_keys=True)

    return blocked_visitors_data_json


def authorize_visitor(visitor_id, visitor_ip):
    try:
        DEBUG = app.config["DEBUG"]
        now = datetime.datetime.utcnow()
        start = now - datetime.timedelta(seconds=now.second + 3)

        date_start = datetime.datetime.strftime(start, '%Y-%m-%d %H:%M:%S')
        date_end = datetime.datetime.strftime(now, '%Y-%m-%d %H:%M:%S')
        
        if DEBUG:
            start_time = time.time()

        # Get visits records
        visits_query = AccessLog.query \
            .with_hint(AccessLog,"FORCE INDEX (time)") \
            .filter(AccessLog.visitorId == visitor_id) \
            .filter(AccessLog.time.between(date_start, date_end)) \
            .distinct(AccessLog.time) \
            .order_by(AccessLog.time.desc()) \

        visit_data = visits_query.first()

        blocked_visitors_query = BlockedVisitors.query \
            .with_hint(BlockedVisitors,"FORCE INDEX (blocked_at)") \
            .filter(BlockedVisitors.visitorId == visitor_id) \
            .distinct(BlockedVisitors.blocked_at) \
            .order_by(BlockedVisitors.blocked_at.desc())

        visitor_blocked_data = blocked_visitors_query.first()
        
        if DEBUG:
            statement = visits_query.statement
            raw_text_sql=statement.compile(
                dialect=LiteralDialect(),
                compile_kwargs={'literal_binds': True},
            ).string
            #print("Calls data SQL: " + raw_text_sql.replace("\n", ""))

            print("--- SQL (Get visits data) execution time %s seconds ---" % (time.time() - start_time))

    except exc.OperationalError as e:
        raise

    if visit_data and not visitor_blocked_data:
        return True
    else:
        return '{"error": "AUTH_REQUEST_FAILED"  }'

def get_sip_call_data(visitor_id):
    user = "9910000"
    password = "dc6f9ae0e36d3db73356388de48ddebb"
    uri = "9910000@pbx.voloshanenko.com"
    remote_number = "2000@pbx.voloshanenko.com"
    ws_server = "wss://pbx.voloshanenko.com:8089/ws"

    auth = {}
    auth['user'] = user
    auth['password'] = password
    auth['uri'] = uri
    auth['remoteNumber'] = remote_number
    auth['wsServer'] = ws_server

    sip_call_data = json.loads("{}")
    sip_call_data['sip_auth'] = auth

    return json.dumps(sip_call_data)

def modify_visitor(visitor_id, action):
    blocked_user = BlockedVisitors.query.filter_by(visitorId=visitor_id).first()
        
    if action == "block":
        if blocked_user:
            modify_visitor_status = '{ "error": "MODIFY_REQUEST_ALREADY_BLOCKED" }'
        else:
            blocked_user = BlockedVisitors()
            blocked_user.visitorId = visitor_id
            now = datetime.datetime.utcnow()
            blocked_user.blocked_at = datetime.datetime.strftime(now, '%Y-%m-%d %H:%M:%S')
            db.session.add(blocked_user)
            db.session.commit()
            modify_visitor_status = '{ "result": "MODIFY_REQUEST_BLOCKED" }'
    elif action == "unblock":
        if blocked_user:
            db.session.delete(blocked_user)
            db.session.commit()
            modify_visitor_status = '{ "result": "MODIFY_REQUEST_UNBLOCKED" }'
        else:
            modify_visitor_status = '{ "error": "MODIFY_REQUEST_NOT_BLOCKED" }'   
    
    return modify_visitor_status