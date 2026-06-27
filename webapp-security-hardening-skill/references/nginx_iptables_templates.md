# Nginx / iptables / systemd Templates

## Nginx HTTPS reverse proxy

```nginx
server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_certificate /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy no-referrer always;

    location / {
        proxy_pass http://APP_PRIVATE_HOST:APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Authorization $http_authorization;
    }
}

server {
    listen 80;
    server_name api.example.com;
    return 301 https://$host$request_uri;
}
```

## Nginx layer token guard

只适合简单 API。复杂身份认证应放应用层或专门网关。

```nginx
location / {
    if ($http_authorization != "Bearer REPLACE_WITH_TOKEN") {
        return 401;
    }
    proxy_pass http://APP_PRIVATE_HOST:APP_PORT;
}
```

## iptables: anti-local-agent mode

```bash
PORT=8000
sudo iptables -A INPUT -p tcp -s 127.0.0.1 --dport "$PORT" -j DROP
sudo iptables -A INPUT -p tcp -s 127.0.0.0/8 --dport "$PORT" -j DROP
sudo iptables-save | sudo tee /etc/iptables/rules.v4
```

## iptables: allowlist external IP

```bash
PORT=8000
ALLOW_IP="203.0.113.10/32"
sudo iptables -A INPUT -p tcp --dport "$PORT" -s "$ALLOW_IP" -j ACCEPT
sudo iptables -A INPUT -p tcp --dport "$PORT" -j DROP
```

## systemd service template

```ini
[Unit]
Description=Secure WebApp
After=network.target

[Service]
User=appuser
Group=appuser
WorkingDirectory=/opt/myapp
EnvironmentFile=/etc/myapp/myapp.env
ExecStart=/opt/myapp/.venv/bin/uvicorn main:app --host ${APP_HOST} --port ${APP_PORT}
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
```
