FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py startup.py ./

ENV VLM_MODEL=qwen3.6:35b-a3b \
    HOST=0.0.0.0 \
    PORT=8000

EXPOSE 8000

CMD ["sh", "-c", "python startup.py && python main.py"]
