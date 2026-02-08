# Guía de Despliegue: Full-Stack (Node.js + React) con Nginx

Esta guía explica cómo desplegar la aplicación en un entorno de producción en un servidor con Arch Linux, sirviendo el frontend de React a través de la API de Node.js/Express y usando Nginx como proxy inverso.

### Resumen del Flujo en Producción

El objetivo es que el usuario final solo acceda a un único punto: Nginx. Nginx decidirá si la petición es para la API o para cargar la aplicación de React.

1.  **Usuario** -> `http://tu_dominio.com` (Puerto 80) -> **Nginx**
2.  **Nginx** -> Reenvía la petición a tu aplicación **Node.js** (que corre en un puerto interno, por ejemplo, el 5000).
3.  **Aplicación Node.js**:
    *   Si la ruta es `/api/...`, la maneja como una llamada de API normal.
    *   Para cualquier otra ruta (`/`, `/grupos`, `/perfil`, etc.), sirve el archivo `index.html` de tu aplicación React. React se encarga del enrutamiento en el lado del cliente.

---

### Paso 1: Preparar el Frontend (Cliente React)

Primero, necesitas generar la versión de producción de tu aplicación de React. Esta versión es un conjunto de archivos estáticos (HTML, CSS, JS) optimizados.

1.  Navega al directorio de tu cliente:
    ```bash
    cd client
    ```
2.  Ejecuta el script de compilación:
    ```bash
    npm run build
    ```
    Esto creará una carpeta `dist` dentro de `client/` (`client/dist/`). Estos son los archivos que serviremos.

---

### Paso 2: Modificar la API (Express) para Servir el Frontend

Ahora, debes indicarle a tu servidor de Express que, en un entorno de producción, debe servir los archivos estáticos que acabas de generar.

1.  **Edita tu archivo principal de la API, `api/src/app.ts`**, para añadir el siguiente código. Es crucial que lo añadas **después** de definir todas tus rutas de la API, pero **antes** de tu manejador de errores.

    ```typescript
    // ... (importaciones existentes)
    import path from 'path';
    
    // ... (tus middlewares y app.use('/api', ...))
    
    // ======== AÑADIR ESTE BLOQUE ========
    // Servir archivos estáticos del frontend en producción
    if (process.env.NODE_ENV === 'production') {
      // Servir la carpeta 'dist' generada por Vite/React
      app.use(express.static(path.join(__dirname, '../../client/dist')));
    
      // Para cualquier otra petición que no sea de la API, servir el index.html de React
      // Esto permite que el enrutamiento del lado del cliente de React funcione correctamente.
      app.get('*', (req, res) => {
        res.sendFile(path.resolve(__dirname, '../../client/dist', 'index.html'));
      });
    }
    // =====================================
    
    // ... (tu middleware de manejo de errores, si tienes uno)
    
    export default app;
    ```

    **Explicación:**
    *   `if (process.env.NODE_ENV === 'production')`: Este código solo se ejecutará cuando inicies tu servidor en modo producción.
    *   `app.use(express.static(...))`: Le dice a Express que sirva los archivos que se encuentran en `client/dist` (como `main.js`, `main.css`, etc.) de forma estática. La ruta se construye de forma relativa desde la ubicación del archivo `app.js` compilado.
    *   `app.get('*', ...)`: Este es el "catch-all". Si una petición no coincide con ninguna ruta de la API (por ejemplo, `/grupos/123`), en lugar de dar un 404, sirve el `index.html` principal. React-Router recibirá la URL y mostrará la página correcta.

---

### Paso 3: Configurar Nginx como Proxy Inverso en Arch Linux

Nginx actuará como el "portero" de tu servidor. Escuchará en el puerto 80 (HTTP) y redirigirá el tráfico a tu aplicación Node.js, que se ejecutará en un puerto interno y no será accesible directamente desde el exterior.

1.  **Instalar Nginx:**
    ```bash
    sudo pacman -Syu nginx
    ```

2.  **Crear un archivo de configuración para tu aplicación:**
    Es una buena práctica crear un archivo de configuración por sitio en lugar de editar el `nginx.conf` principal.

    ```bash
    sudo nano /etc/nginx/sites-available/trincaunt.conf
    ```

3.  **Pega la siguiente configuración en el archivo:**

    ```nginx
    server {
        listen 80;
        server_name tu_dominio.com www.tu_dominio.com; # Reemplaza con tu dominio o la IP del servidor

        location / {
            # Puerto en el que se ejecuta tu API de Node.js
            proxy_pass http://localhost:5000; 
            
            # Cabeceras importantes para que el backend reciba la información original de la petición
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
    ```

    **Explicación de los puertos:**
    *   `listen 80;`: Nginx escucha en el puerto 80, el puerto estándar para el tráfico HTTP. Este es el puerto público.
    *   `proxy_pass http://localhost:5000;`: Nginx reenvía todas las peticiones que recibe a tu aplicación Node.js, que deberás ejecutar en el **puerto 5000**. Este es el puerto interno de la aplicación, no debe ser accesible desde fuera. Puedes usar otro puerto si lo prefieres (ej. 3000, 8080), pero asegúrate de que coincida aquí y en tu API.

4.  **Activar la configuración:**
    Nginx en Arch no usa `sites-enabled` por defecto como en Debian/Ubuntu. Debes incluir tu archivo directamente en `nginx.conf`.

    Edita el archivo principal:
    ```bash
    sudo nano /etc/nginx/nginx.conf
    ```
    Y al final del bloque `http { ... }`, añade la siguiente línea:
    ```nginx
    include sites-available/trincaunt.conf;
    ```

5.  **Probar la configuración y arrancar Nginx:**
    ```bash
    # Probar que la sintaxis de la configuración es correcta
    sudo nginx -t

    # Iniciar el servicio de Nginx y hacer que arranque con el sistema
    sudo systemctl start nginx
    sudo systemctl enable nginx
    ```

---

### Flujo de Despliegue Completo

Cuando quieras desplegar una nueva versión, harías lo siguiente:

1.  Sube tu código más reciente al servidor.
2.  **Construye el frontend:**
    ```bash
    cd /ruta/a/tu/proyecto/client
    npm install
    npm run build
    ```
3.  **Instala las dependencias y compila la API:**
    ```bash
    cd /ruta/a/tu/proyecto/api
    npm install
    npm run build # O el comando que uses para compilar de TS a JS
    ```
4.  **Inicia tu aplicación Node.js en modo producción.** Es muy recomendable usar un gestor de procesos como `pm2` para que se reinicie automáticamente si falla.

    ```bash
    # Instalar pm2 globalmente si no lo tienes
    npm install -g pm2
    
    # Iniciar tu app con pm2
    cd /ruta/a/tu/proyecto/api
    NODE_ENV=production pm2 start dist/server.js --name trincaunt-api
    ```
    `pm2` se encargará de que tu aplicación siga corriendo en segundo plano en el puerto 5000.

5.  Asegúrate de que Nginx esté corriendo (`sudo systemctl status nginx`).
