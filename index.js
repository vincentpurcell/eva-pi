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

const config = require('./config.json');

// Try to read an auth token if one exists.
const auth = require('./auth.json');

// Device initialization
const campi = new Campi();
const api = config.API_URL;
const thisDeviceSerial = piinfo.serial();

// Raspberry Pi GPIO pin
const fanPin = 3;

const imageConfig = {
    width: 1024,
    height: 768,
    nopreview: true,
    timeout: 1,
    hflip: true,
    vflip: true
};

const sensor = {
    name: "Sensor #1",
    type: 11, // DHT 11
    pin: 17
};

// S3 initialization
const bucketName = config.S3_BUCKET;

AWS.config = {
    "accessKeyId": config.S3_KEY,
    "secretAccessKey": config.S3_SECRET,
    "region": config.AWS_REGION
};

const s3 = new AWS.S3({ region: AWS.config.region });

const saveImageToDb = (image, time, temp, humidity) => {
    const newImageObject = {};
          newImageObject.s3Url = ``;
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
            saveImageToDb(imagePath, time, temp, humidity);
        });
    });
};

const turnOnFan = () => {
    gpio.setup(fanPin, gpio.DIR_OUT, () => {
        gpio.write(fanPin, true, (err) => {
            if (err) throw err;
            console.log('Fan on.');
        });
    });
};

const turnOffFan = () => {
    gpio.setup(fanPin, gpio.DIR_OUT, () => {
        gpio.write(fanPin, false, (err) => {
            if (err) throw err;
            console.log('Fan off.');
        });
    });
};

const startCapture = () => {
    let busy = false;

    if (!busy) {
        busy = true;

        const sensorReading = sensorLib.read(sensor.type, sensor.pin);
        const timeNowISO = new Date().toISOString();
        const filename = `${timeNowISO}.jpg`;

        const tempFarenheit = (sensorReading.temperature * (9/5) + 32).toFixed(1);
        const humidity = (sensorReading.humidity).toFixed(1);

        if (tempFarenheit > 75 || humidity > 80) {
            turnOnFan();
        } else {
            turnOffFan();
        }

        campi.getImageAsFile(imageConfig, filename, (err) => {
            if (err) { throw err; }

            // Take temperature and humidity reading to accompany the file

            // Send the file to S3...
            uploadFileToS3(filename, timeNowISO, tempFarenheit, humidity);
        });
    }
};

const doLogin = () => {
    // See if we have logged in before. If so, send the auth key. If not, register as a new device and save the auth token.
    startCapture();
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
