# eva-pi

This application is meant to be run directly on a raspberry pi, using a camera module and assorted sensors. It will authenticate itself again the eva-server API. The device will, at an interval, snap a photo, send it to a protected S3 bucket, and create a DB record with associated timestamp, humidity and temperature at the time of the photo.

The accompanying applications, [Eva Server](https://github.com/vincentpurcell/eva-server) and [Eva Frontend](https://github.com/vincentpurcell/eva-frontend) provide the API and web portal, respectively. Each can be independently deployed.

More info to come as I sketch out the rest of the project :)

## Things to add

Configurability:
- Monitoring intervals
- Image quality
- Adding/removing relays
- Specifying what triggers a relay (environment variable or time based or manual)
- Adding/removing sensors
- Mechanism to associate an EVA user account to this device
