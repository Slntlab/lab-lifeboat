# Lab Lifeboat -- static site on nginx
#   docker build -t lab-lifeboat .
#   docker run --rm -p 8080:80 lab-lifeboat
# Then open http://localhost:8080/
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html core.js app.js lifeboat.css sw.js manifest.webmanifest \
     icon-192.png icon-512.png icon-maskable-512.png og-lab-lifeboat.png \
     restore-drill-reminder.ics /usr/share/nginx/html/
