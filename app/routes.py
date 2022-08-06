from ast import Or
from crypt import methods
from sqlite3 import IntegrityError
from sys import exc_info
from app import parser
import json
import os
import sqlalchemy
import werkzeug
from datetime import datetime
from werkzeug.urls import url_parse
from flask import render_template, request, Response, url_for, redirect, flash
from flask_login import current_user, login_user, logout_user, login_required
from app import app


@app.context_processor
def override_url_for():
    return dict(url_for=dated_url_for)

def dated_url_for(endpoint, **values):
    if endpoint == 'static':
        filename = values.get('filename', None)
        if filename is not None:
            path = os.path.join(app.root_path, endpoint, filename)
            values['ts'] = int(os.stat(path).st_mtime)
    return url_for(endpoint, **values)


@app.before_request
def basic_authorize():
    auth = request.authorization
    if not current_user.is_active and auth and auth.type == 'basic':
        user, login_passed = parser.check_user_credentials(auth.username, auth.password)
        if not login_passed:
            flash('Invalid username or password', 'error')
            return 'The provided username and password are invalid.', 403
        login_user(user)


@app.route('/')
@app.route('/index')
def index():
    return render_template('call.html')

@app.route('/webhooks/fingerprint', methods=['POST'])
@login_required
def fingerprint_incoming_data():
    try:
        data = request.json
        parser.insert_access_entry(data)
        status = '{ "success" }'
        status_code = 200
    except werkzeug.exceptions.BadRequest as e:
        status = '{"error": "Input data corrupted"}'
        status_code = 400
    except sqlalchemy.exc.IntegrityError as e:
        exc_text = str(e.orig)
        if "NOT NULL" in exc_text:
            status = '{"error": "Mandatory data fields not provided"}'
        elif "" in exc_text:
            status = '{"error": "Non unique data fields provided"}'
        else:
            status = '{"error": "Unknown exception"}'
        status_code = 400
    except TypeError as e:
        status = {"error": "Incorrect data"}
        status_code = 500

    response=Response(status,content_type='application/json; charset=utf-8')
    response.headers.add('content-length',len(status))
    response.status_code=status_code

    return response

@app.route('/analytics')
@login_required
def analytics():
    return render_template('resultTable.html')


@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('analytics'))

    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        remember_me = checked = 'rememberme_check' in request.form
        if username and password:
            user, login_passed = parser.check_user_credentials(username, password)
            if not login_passed:
                flash('Invalid username or password', 'error')
                return redirect(url_for('login'))
            login_user(user, remember=remember_me)
            next_page = request.args.get('next')
            if not next_page or url_parse(next_page).netloc != '':
                next_page = url_for('analytics')
            return redirect(next_page)
        else:
            flash('All fileds required!', 'error')
    return render_template('login.html', title='Sign In')


@app.route('/logout')
def logout():
    logout_user()
    return redirect(url_for('login'))


@app.route('/_raw_data/', methods=['GET'])
@login_required
def get_visits_data_response():
    date_start = request.args.get("date_start")
    date_end = request.args.get("date_end")

    response = json.loads('{}')
    try:
        try:
            date_start_obj = datetime.strptime(date_start, '%Y-%m-%d %H:%M:%S')
            date_end_obj = datetime.strptime(date_end, '%Y-%m-%d %H:%M:%S')
        except TypeError as e:
            response['error'] = "data_start/data_end fields should be DateTime!"
            return response, 422
        if date_start_obj > date_end_obj:
            raise ValueError("End date/time can't be lower than start date!")
        try:
            visits_data_raw, blocked_visitors_raw = parser.visits_data(date_start=date_start, date_end=date_end)
            response['all_visits'] = json.loads(visits_data_raw)
            response['blocked_visitors'] = json.loads(blocked_visitors_raw)
        except Exception as e:
            response['error'] = str(e.orig.args[1])
    except ValueError as e:
        response['error'] = str(e.args[0])

    return response, 200
    

@app.route('/_get_sip_auth/', methods=['GET'])
def sip_auth_response():
    visitor_id = request.args.get("visitor_id")
    visitor_ip = request.remote_addr

    if not visitor_id or not visitor_ip:
        sip_auth_status = '{ "error": "AUTH_REQUEST_INVALID" }'
    else:
        authorized = parser.authorize_visitor(visitor_id, visitor_ip)
        if authorized == True:
            sip_auth_status = parser.get_sip_call_data(visitor_id)
        else:
            sip_auth_status = authorized

    response=Response(sip_auth_status,content_type='application/json; charset=utf-8')
    response.headers.add('content-length',len(sip_auth_status))
    response.status_code=200

    return response


@app.route('/_modify_visitor/', methods=['GET'])
def modify_visitor_status():
    visitor_id = request.args.get("visitor_id")
    action = request.args.get("action")
    
    if not visitor_id or not action or action not in ["block", "unblock"]:
        modify_visitor_status = '{ "error": "MODIFY_REQUEST_INVALID" }'
    else:
        modify_visitor_status = parser.modify_visitor(visitor_id, action)
        
    response=Response(modify_visitor_status,content_type='application/json; charset=utf-8')
    response.headers.add('content-length',len(modify_visitor_status))
    response.status_code=200

    return response