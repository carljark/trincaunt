# Guía de Despliegue con HTTPS: Full-Stack (Node.js + React) con Nginx y Let's Encrypt

Esta guía es una extensión de la guía de despliegue básica. Aquí se detalla cómo securizar tu aplicación con un certificado SSL/TLS gratuito de Let's Encrypt, permitiendo el acceso a través de HTTPS.

Los pasos para preparar el frontend y modificar la API son idénticos a la guía de despliegue estándar.

- **Paso 1: Preparar el Frontend (Cliente React)** -> Sin cambios.
- **Paso 2: Modificar la API (Express) para Servir el Frontend** -> Sin cambios.

La diferencia principal radica en la configuración de Nginx.

---

### Paso 3: Configurar Nginx con HTTPS (Let's Encrypt)

En lugar de solo escuchar en el puerto 80 (HTTP), configuraremos Nginx para que escuche en el puerto 443 (HTTPS), gestione el certificado SSL y redirija todo el tráfico HTTP a HTTPS.

**Requisito previo:** Debes tener un nombre de dominio apuntando a la dirección IP pública de tu servidor. Let's Encrypt no puede emitir certificados para direcciones IP.

1.  **Instalar Nginx y Certbot:**
    Certbot es la herramienta que automatiza la creación e instalación de certificados de Let's Encrypt. El plugin `certbot-nginx` se integra directamente con Nginx.
    ```bash
    sudo pacman -Syu nginx certbot-nginx
    ```

2.  **Crear el archivo de configuración base de Nginx:**
    Antes de obtener el certificado, creamos una configuración simple para que Certbot pueda verificar la propiedad del dominio.
    ```bash
    sudo mkdir -p /etc/nginx/sites-available
    sudo nano /etc/nginx/sites-available/trincaunt.conf
    ```
    Pega esta configuración inicial. **Es importante que `server_name` sea correcto.**
    ```nginx
    server {
        listen 80;
        server_name tu_dominio.com www.tu_dominio.com; # Reemplaza con tu dominio real

        location / {
            # Temporalmente, solo para que certbot funcione
            root /usr/share/nginx/html;
            index index.html index.htm;
        }
    }
    ```

3.  **Activar la configuración e iniciar Nginx:**
    Edita `/etc/nginx/nginx.conf` (`sudo nano /etc/nginx/nginx.conf`) y añade al final del bloque `http`:
    ```nginx
    include sites-available/*.conf;
    ```
    Ahora, prueba e inicia Nginx:
    ```bash
    sudo nginx -t
    sudo systemctl start nginx
    sudo systemctl enable nginx
    ```

4.  **Obtener el Certificado SSL:**
    Ejecuta Certbot. Usará el plugin de Nginx para leer tu configuración, solicitar un certificado para los dominios que encuentre y **modificar automáticamente tu archivo de configuración** para usar HTTPS.
    ```bash
    sudo certbot --nginx -d tu_dominio.com -d www.tu_dominio.com
    ```
    Sigue las instrucciones en pantalla. Cuando te pregunte sobre la redirección, elige la opción **2 (Redirect)** para forzar que todo el tráfico HTTP vaya a HTTPS.

5.  **Verificar la configuración final de Nginx:**
    Si abres de nuevo tu archivo (`sudo nano /etc/nginx/sites-available/trincaunt.conf`), verás que Certbot lo ha modificado. Ahora, **necesitas editarlo por última vez** para añadir el `proxy_pass` a tu aplicación de Node.js.

    El archivo se verá similar a esto (con tus rutas de certificado):

    ```nginx
    server {
        server_name tu_dominio.com www.tu_dominio.com;

        # ---- ¡EDITA ESTA SECCIÓN! ----
        location / {
            # Puerto en el que se ejecuta tu API de Node.js
            proxy_pass http://localhost:5000; 
            
            # Cabeceras importantes para el proxy inverso
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
        # -----------------------------

        listen [::]:443 ssl ipv6only=on; # managed by Certbot
        listen 443 ssl; # managed by Certbot
        ssl_certificate /etc/letsencrypt/live/tu_dominio.com/fullchain.pem; # managed by Certbot
        ssl_certificate_key /etc/letsencrypt/live/tu_dominio.com/privkey.pem; # managed by Certbot
        include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
        ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
    }

    server {
        if ($host = www.tu_dominio.com) {
            return 301 https://$host$request_uri;
        } # managed by Certbot

        if ($host = tu_dominio.com) {
            return 301 https://$host$request_uri;
        } # managed by Certbot

        listen 80;
        listen [::]:80;
        server_name tu_dominio.com www.tu_dominio.com;
        return 404; # managed by Certbot
    }
    ```
    La clave fue reemplazar el `location / { ... }` que Certbot pudo haber creado por el bloque `location` con la configuración de `proxy_pass`.

6.  **Recargar Nginx para aplicar los cambios:**
    ```bash
    sudo nginx -t
    sudo systemctl reload nginx
    ```

7.  **Configurar la Renovación Automática:**
    Los certificados de Let's Encrypt duran 90 días. Certbot configura automáticamente una tarea (un timer de systemd en Arch) para renovarlos. Puedes verificar que la renovación funciona con este comando:
    ```bash
    sudo certbot renew --dry-run
    ```
    Si no da errores, la renovación automática está bien configurada.

---

### Flujo de Despliegue Completo (con HTTPS)

El flujo es el mismo que en la guía estándar, solo que ahora tu aplicación será accesible a través de `https://tu_dominio.com`.

1.  Sube el código al servidor.
2.  Construye el frontend: `cd client && npm install && npm run build`.
3.  Instala/compila la API: `cd api && npm install && npm run build`.
4.  Inicia o reinicia tu aplicación Node.js con `pm2`:
    ```bash
    # Si es la primera vez
    NODE_ENV=production pm2 start dist/server.js --name trincaunt-api
    
    # Si ya estaba corriendo, para actualizar
    pm2 restart trincaunt-api
    ```
5.  Asegúrate de que Nginx esté corriendo y con la configuración de HTTPS cargada.
