import * as cheerio from 'cheerio';
import * as fs from 'fs';

export const base_url = "https://desktop.firmware.mobi";

export function getDeviceUrl(device: string) {
    return `${base_url}/device:${device}`;
}

export function getFirmwareUrl(device: string, firmware: string) {
    return `${base_url}/device:${device}/firmware:${firmware}`;
}

export interface Firmware {
    build_disp: string;
    utc: number;
    patch: string;
    build_id: string;
    build_inc: string;
    source: string;
    source_id: number;
    id: number;
    android: string;
}

export interface Device {
    device_id: number;
    firmware: Firmware;
    url: string;
    data: { [key: string]: string };
}

async function scrapeFirmwareData(url: string): Promise<Firmware[]> {
    try {
        // Step 1: Fetch the HTML content from the URL
        const response = await fetch(url);
        if (!response.ok) {
            return Promise.reject(`Failed to fetch URL: ${response.statusText}`);
        }

        const htmlData = await response.text();

        // Step 2: Use a regular expression to extract the JSON data from the script tag
        const regex = /firmwares\s*=\s*(\[[^\]]*\])/;
        const matches = regex.exec(htmlData);
        if (!matches || matches.length < 2) {
            return Promise.reject("Failed to find firmware data");
        }

        return Promise.resolve(JSON.parse(matches[1]));
    } catch (error) {
        console.error(`Failed to scrape firmware data: ${error}`);
        return Promise.reject(error);
    }
}

function extractDeviceData(
    device_id: number,
    firmware: Firmware,
    url: string,
    raw: string
): Device {
    const lines = raw.split('\n');
    let device: Device = {
        device_id,
        firmware,
        url,
        data: {}
    };

    for (let line of lines) {
        if (line.startsWith("#")) {
            continue;
        }

        const parts = line.split('=');
        if (parts.length < 2) {
            continue;
        }

        const key: string = parts[0].trim();
        const value: string = parts[1].trim();
        device.data[key] = value;
    }

    return device;
}

async function scrapeDeviceData(
    device_id: number,
    firmware: Firmware,
    url: string
): Promise<Device> {
    try {
        // Fetch the HTML content from the URL
        const response = await fetch(url);
        if (!response.ok) {
            return Promise.reject(`Failed to fetch URL: ${response.statusText}`);
        }

        const htmlData = await response.text();
        // Step 1: Parse the HTML content
        const $ = cheerio.load(htmlData);

        // Step 2: Extract the data from the HTML content
        const doc = $('pre');
        const data = extractDeviceData(
            device_id,
            firmware,
            url,
            doc.text()
        );
        return data;
    } catch (error) {
        console.error(`Failed to scrape device data: ${error}`);
        return Promise.reject(error);
    }
}

async function appendDevicesToFile(devices: Device[]) {
    if (!fs.existsSync('devices.json')) {
        fs.writeFileSync('devices.json', JSON.stringify(devices, null, 2));
        return;
    }

    const data = fs.readFileSync('devices.json');
    const loadedDevices = JSON.parse(data.toString());
    loadedDevices.push(...devices);

    fs.writeFileSync('devices.json', JSON.stringify(loadedDevices, null, 2));
}

async function main() {
    const max_device_id = 2334;
    let devices: Device[] = [];

    for (let i = 0; i < max_device_id; i++) {
        try {
            const url = getDeviceUrl(`${i}`);
            const firmwares = await scrapeFirmwareData(url);

            for (let firmware of firmwares) {
                let firmwareUrl = getFirmwareUrl(`${i}`, `${firmware.id}`);
                try {
                    let data = await scrapeDeviceData(i, firmware, firmwareUrl);
                    devices.push(data);
                } catch (error) {
                    console.error(`Failed to scrape device data for device ${i}: ${error}`);
                    continue;
                }
            }

            await appendDevicesToFile(devices);
            devices = [];

            console.log(`Scraped data for device ${i}`);
        } catch (error) {
            console.error(`Failed to scrape firmware data for device ${i}: ${error}`);
            continue;
        }
    }
}

main();