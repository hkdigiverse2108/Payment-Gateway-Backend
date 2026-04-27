"use strict"
/**
 * @author Pramit Mangukiya
 */
import winston from 'winston'
import moment from 'moment-timezone'
const timeFormat = moment().format('DD-MM-YYYY hh:mm:ss A')
const colorizer = winston.format.colorize()
const timeZone: any = "Asia/Calcutta"
let logColor: any = {
    colors: {
        error: "red",
        warn: "magenta",
        info: "yellow",
        http: "green",
        debug: "cyan"
    }
},
    name: String = "Q&A"
winston.addColors(logColor)

let alignColorsAndTime = winston.format.combine(
    winston.format.colorize({
        all: true
    }),
    winston.format.timestamp({
        format: timeFormat
    }),
    winston.format.json(),
    winston.format.printf(
        info => `\x1b[96m[${name}]` + " " + `\x1b[95m${moment.tz(timeZone)}` + " " + colorizer.colorize(winston.level, `- ${info.level}: ${info.message}`)
    )
);

let fileLogger = winston.format.combine(
    winston.format.timestamp({
        format: timeFormat
    }),
    winston.format.json(),
    winston.format.printf(
        info => `${info.timestamp}  ${info.level} : ${info.message}`
    )
)

export const logger = winston.createLogger({
    level: "debug",
    transports: [
        new winston.transports.Http({
            level: 'warn',
            format: winston.format.json()
        }),
        new (winston.transports.Console)({
            format: alignColorsAndTime,
        })
    ],
});

export const reqInfo = function (req) {
    const userAgent = req.header('user-agent') || "";
    let splitResult = userAgent.split("(").toString().split(")")
    let browserName = splitResult[splitResult.length - 1] || "Unknown Browser"
    splitResult = splitResult[0].split(",")
    let osName = splitResult[1] || "Unknown OS"
    logger.http(`${req.method} ${req.headers.host}${req.originalUrl} \x1b[33m device os => [${osName}] \x1b[1m\x1b[37mip address => ${req.ip} \n\x1b[36m browser => ${browserName}`)
}