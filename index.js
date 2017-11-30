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

// Try to read an auth token if one exists.
const auth = require('./auth.json');

// Device initialization
const campi = new Campi();
const api = config.API_URL;
const thisDeviceSerial = piinfo.serial();

// Raspberry Pi GPIO pin, but the
// rpi-gpio library uses Wiring Pi pinout.
const fanPin = 29;
let fanIsOn = false;
let lastFanStart = null;

const imageConfig = {
    width: 3280,
    height: 2464,
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
          newImageObject.timestamp = time;
          newImageObject.temperature = temp;
          newImageObject.humidity = humidity;

    // POST newImageObject to db.
    axios.post(`${api}/device/image`, newImageObject, (err, res) => {
        if (err) { throw (err) }
        console.log('res', res);
    });
    deleteFile(image);
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
            if (err) { throw (err) }
            console.log('Saved to S3, Response: ', data);
            saveImageToDb(filename, time, temp, humidity);
        });
    });
};

const turnOnFan = () => {
    if (fanIsOn) {
        return;
    }

    gpio.setup(fanPin, gpio.DIR_OUT, () => {
        gpio.write(fanPin, true, (err) => {
            if (err) throw err;
            fanIsOn = true;
            console.log('Turned fan on.');
        });
    });
};

const turnOffFan = () => {
    if (!fanIsOn) {
        return;
    }

    gpio.setup(fanPin, gpio.DIR_OUT, () => {
        gpio.write(fanPin, false, (err) => {
            if (err) throw err;
            fanIsOn = false;
            console.log('Turned fan off.');
        });
    });
};

const startCapture = () => {
    if (!busy) {
        busy = true;

        const sensorReading = sensorLib.read(sensor.type, sensor.pin);
        const timeNowISO = new Date().toISOString();
        const filename = `${timeNowISO}.jpg`;

        const tempFarenheit = (sensorReading.temperature * (9/5) + 32).toFixed(1);
        const humidity = (sensorReading.humidity).toFixed(1);

        if (tempFarenheit > 85 || humidity > 60) {
            turnOnFan();
        } else {
            turnOffFan();
        }

        campi.getImageAsFile(imageConfig, filename, (err) => {
            if (err) { throw err; }

            // Take temperature and humidity reading to accompany the file

            // Send the file to S3...
            busy = false;
            uploadFileToS3(filename, timeNowISO, tempFarenheit, humidity);
        });
    }
};

const doLogin = () => {
    // See if we have logged in before. If so, send the auth key. If not, register as a new device and save the auth token.
    setInterval(() => {startCapture();}, 5000);
    // ip.v4().then((ip) => {
    //     // Authenticate against the API to get a token, then use that token for subsequent requests.
    //     axios.post({uri: `${api}/device/login`, { device: thisDeviceSerial, password: config.RPI_PASSWORD, ip: ipAddress }}, (error, res) => {
    //         // If we successfully authenticate, start interval image captures forever.
    //         if (response && response.statusCode && response.statusCode === 200) {
    //             startCapture();
    //         }
    //     });
    // });
};

doLogin();
