# eva-pi

This application is meant to be run directly on a raspberry pi, using a camera module and assorted sensors. It will authenticate itself again the eva-server API. The device will, at an interval, snap a photo, send it to a protected S3 bucket, and create a DB record with associated timestamp, humidity and temperature at the time of the photo.

The accompanying applications, [Eva Server](https://github.com/vincentpurcell/eva-server) and [Eva Frontend](https://github.com/vincentpurcell/eva-frontend) provide the API and web portal, respectively. Each can be independently deployed.

More info to come as I sketch out the rest of the project :)
