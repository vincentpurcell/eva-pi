const Campi = require('campi');
const fs = require('fs');
const app = require('express')();
const http = require('http').Server(app);
const piinfo = require('piinfo');
const sensorLib = require('node-dht-sensor');
const AWS = require('aws-sdk');
const axios = require('axios');
const ip = require('public-ip');
const gpio = require('rpi-gpio');

// Read the configuration for things like AWS keys
const config = require('./config.json');

const auth = {};
auth.token = null;

// Device initialization
const campi = new Campi();
const api = config.API_URL;
const thisDeviceSerial = piinfo.serial();

let lastFanOff = new Date().getTime();

// Raspberry Pi GPIO pin, but the
// rpi-gpio library uses Wiring Pi pinout.
const fanPin = 29;
let fanIsOn = true;
let lastFanStart = null;

const imageConfig = {
    width: 1640,
    height: 1232,
    nopreview: true,
    timeout: 1,
    hflip: true,
    vflip: false
};

// DHT 11 is type "11"
const sensor = {
    name: "Sensor #1",
    type: 11,
    pin: 17
};

// S3 initialization
const bucketName = config.S3_BUCKET;
let busy = false;

AWS.config = {
    "accessKeyId": config.S3_KEY,
    "secretAccessKey": config.S3_SECRET,
    "region": config.AWS_REGION
};

const s3 = new AWS.S3({ region: AWS.config.region });

const saveImageToDb = (image, time, temp, humidity) => {
    const newImageObject = {};
          newImageObject.s3Key = image;
          newImageObject.temperature = temp;
          newImageObject.humidity = humidity;

    // POST newImageObject to db.
    axios.post(`${api}/device/image`, newImageObject, {headers: { authorization: auth.token }})
    .then((res) => {
        axios.post(`${api}/device/event`, { type: 'TOOK_PHOTO', data: JSON.stringify(newImageObject) }, { headers: { authorization: auth.token } });
        busy = false;
    })
    .catch((err) => {
        throw (err);
    });
};

const deleteFile = (filename) => {
    fs.unlink(filename);
};

const uploadFileToS3 = (filename, time, temp, humidity) => {
    fs.readFile(filename, (err, imageData) => {
        if (err) { throw (err) }

        const uploadParams = {
            Bucket: bucketName,
            Key: `${filename}`,
            ContentType: 'image/jpg',
            Body: imageData
        };

        s3.putObject(uploadParams, (err, data) => {
            if (err) {
                deleteFile(filename);
                throw (err);
            }
            deleteFile(filename);
            saveImageToDb(filename, time, temp, humidity);
        });
    });
};

const turnOnFan = (data) => {
    if (fanIsOn) {
        return;
    }

    gpio.setup(fanPin, gpio.DIR_OUT, () => {
        gpio.write(fanPin, true, (err) => {
            if (err) throw err;
            fanIsOn = true;
            if (auth.token) {
                axios.post(`${api}/device/event`, { type: 'FAN_ON', data: JSON.stringify(data) }, { headers: { authorization: auth.token } });
            }
        });
    });
};

const turnOffFan = (data) => {
    if (!fanIsOn) {
        return;
    }

    lastFanOff = new Date().getTime();

    gpio.setup(fanPin, gpio.DIR_OUT, () => {
        gpio.write(fanPin, false, (err) => {
            if (err) throw err;
            fanIsOn = false;
            if (auth.token) {
                axios.post(`${api}/device/event`, { type: 'FAN_OFF', data: JSON.stringify(data) }, { headers: { authorization: auth.token } });
            }
        });
    });
};

const readSensor = () => {
    const sensorReading = sensorLib.read(sensor.type, sensor.pin);
    const tempFarenheit = (sensorReading.temperature * (9/5) + 32).toFixed(1);
    const humidity = (sensorReading.humidity).toFixed(1);
    const diff = new Date().getTime() - lastFanOff;
    const minutesSinceLastRun = Math.ceil((diff / 1000) / 60);

    if (tempFarenheit > 85 || humidity > 60 || (minutesSinceLastRun > 55 && minutesSinceLastRun < 60)) {
        turnOnFan({ temperatue: tempFarenheit, humidity: humidity, lastRun: minutesSinceLastRun });
    } else {
        turnOffFan({ temperatue: tempFarenheit, humidity: humidity, lastRun: minutesSinceLastRun });
    }
};

const startCapture = () => {
    if (!busy) {
        busy = true;

        readSensor();

        campi.getImageAsFile(imageConfig, filename, (err) => {
            if (err) { throw err; }

            // Take temperature and humidity reading to accompany the file
            // Send the file to S3...
            uploadFileToS3(filename, timeNowISO, tempFarenheit, humidity);
        });
    }
};

const captureTimer = () => {
    startCapture();
    setInterval(() => {
        startCapture();
    }, 60000);
};

const doLogin = () => {
    setInterval(() => {
        readSensor();
    }, 5000);

    // Authenticate against the API to get a token, then use that token for subsequent requests.
    axios.post(`${api}/device/auth`, { serial: thisDeviceSerial, password: config.RPI_PASSWORD })
    .then((res) => {
        console.log('auth login', res.data.token);
        auth.token = res.data.token;
        captureTimer();
    })
    .catch((error) => {
        axios.post(`${api}/device/login`, { username: thisDeviceSerial, password: config.RPI_PASSWORD })
        .then((res) => {
            console.log('token login', res.data.token);
            auth.token = res.data.token;
            captureTimer();
        })
        .catch((error) => {
            throw error;
        });
    });
};

doLogin();
