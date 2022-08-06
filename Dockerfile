FROM python:3.10-slim-buster

EXPOSE 5000

COPY  requirements.txt /requirements.txt
RUN pip3 install --no-cache-dir -r requirements.txt
COPY app.py config.py app/
COPY app app/app

WORKDIR app/
CMD ["python3", "app.py"]
