"use strict"
import nodemailer from 'nodemailer';


const mailUser = process.env.MAIL;
const mailPass = process.env.MAIL_PASSWORD;

const option: any = {
    service: "gmail",
    host: 'smtp.gmail.com',
    port: 465,
    tls: {
        rejectUnauthorized: false
    },
    auth: {
        user: mailUser,
        pass: mailPass,
    },
}
const transPorter = nodemailer.createTransport(option)

export const email_verification_mail = async (user: any, otp: any) => {
    return new Promise(async (resolve, reject) => {
        try {
            const mailOptions = {
                from: mailUser, // sender address
                to: user.email, // list of receivers
                subject: "Email verification",
                html: `<html lang="en-US">
    
                <head>
                    <meta content="text/html; charset=utf-8" http-equiv="Content-Type" />
                    <title>Email Verification</title>
                    <meta name="description" content="Email Verification.">
                    <style type="text/css">
                        a:hover {
                            text-decoration: underline !important;
                        }
                    </style>
                </head>
    
                <body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; background-color: #f2f3f8;" leftmargin="0">
                    <!--100% body table-->
                    <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8"
                        style="@import url(https://fonts.googleapis.com/css?family=Rubik:300,400,500,700|Open+Sans:300,400,600,700); font-family: 'Open Sans', sans-serif;">
                        <tr>
                            <td>
                                <table style="background-color: #f2f3f8; max-width:700px;  margin:0 auto;" width="100%" border="0"
                                    align="center" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td style="height:80px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <h1
                                                style="color:#F43939; font-weight:500; margin:0;font-size:32px;font-family:'Rubik',sans-serif;">
                                                Zazzi App</h1>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <table width="95%" border="0" align="center" cellpadding="0" cellspacing="0"
                                                style="max-width:670px;background:#fff; border-radius:3px; text-align:center;-webkit-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);-moz-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                                <tr>
                                                    <td style="height:40px;">&nbsp;</td>
                                                </tr>
                                                <tr>
                                                    <td style="padding:0 35px;">
                                                        <h1
                                                            style="color:#1e1e2d; font-weight:500; margin:0;font-size:32px;font-family:'Rubik',sans-serif;">
                                                            Email Verification</h1>
                                                        <span
                                                            style="display:inline-block; vertical-align:middle; margin:29px 0 26px; border-bottom:1px solid #cecece; width:100px;"></span>
                                                        <p style="color:#455056; font-size:15px;line-height:24px; margin:0;">
                                                            Hi ${(user.firstName != null ? user.firstName : 'dear')} ${(user.lastName != null ? user.lastName : '')}, 
                                                            <br>
                                                            Someone, hopefully you, has requested to new account in Zazzi app
                                                            <br>
                                                            OTP will expire in 10 minutes.
                                                            <br>
                                                            Verification code: ${otp}
                                                            <br>
                                                            <br>
                                                            The Zazzi App Team
                                                        </p>
    
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td style="height:40px;">&nbsp;</td>
                                                </tr>
                                            </table>
                                        </td>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <strong></strong></p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:80px;">&nbsp;</td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                    <!--/100% body table-->
                </body>
    
                </html>`, // html body
            };
            await transPorter.sendMail(mailOptions, function (err, data) {
                if (err) {
                    console.log(err)
                    reject(err)
                } else {
                    resolve(`Email has been sent to ${user.email}, kindly follow the instructions`)
                }
            })
        } catch (error) {
            console.log(error)
            reject(error)
        }
    });
}

export const support_escalation_mail = async (adminEmail: string, ticketDetails: any) => {
    return new Promise(async (resolve, reject) => {
        try {
            const mailOptions = {
                from: mailUser,
                to: adminEmail,
                subject: `🚨 Support Ticket Escalated - ${ticketDetails.ticketId}`,
                html: `<html lang="en-US">
                <head>
                    <meta content="text/html; charset=utf-8" http-equiv="Content-Type" />
                    <title>Support Ticket Escalated</title>
                    <style type="text/css">
                        a:hover { text-decoration: underline !important; }
                        .info-row { padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
                        .label { color: #888; font-size: 13px; }
                        .value { color: #1e1e2d; font-size: 14px; font-weight: 600; }
                    </style>
                </head>
                <body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; background-color: #f2f3f8;" leftmargin="0">
                    <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8"
                        style="font-family: 'Open Sans', sans-serif;">
                        <tr>
                            <td>
                                <table style="background-color: #f2f3f8; max-width:670px; margin:0 auto;" width="100%" border="0"
                                    align="center" cellpadding="0" cellspacing="0">
                                    <tr><td style="height:40px;">&nbsp;</td></tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <h1 style="color:#F43939; font-weight:700; margin:0; font-size:28px;">
                                                ⚠️ Ticket Escalated</h1>
                                        </td>
                                    </tr>
                                    <tr><td style="height:20px;">&nbsp;</td></tr>
                                    <tr>
                                        <td>
                                            <table width="95%" border="0" align="center" cellpadding="0" cellspacing="0"
                                                style="max-width:670px; background:#fff; border-radius:8px; text-align:left;
                                                box-shadow:0 6px 18px 0 rgba(0,0,0,.06); padding: 30px;">
                                                <tr>
                                                    <td style="padding: 20px 35px;">
                                                        <p style="color:#455056; font-size:15px; line-height:24px; margin:0 0 15px;">
                                                            A support ticket has been escalated and requires your immediate attention.
                                                        </p>
                                                        <table width="100%" cellpadding="8" cellspacing="0" style="margin: 15px 0;">
                                                            <tr class="info-row">
                                                                <td class="label" width="35%">Ticket ID</td>
                                                                <td class="value"><strong>${ticketDetails.ticketId}</strong></td>
                                                            </tr>
                                                            <tr class="info-row">
                                                                <td class="label">Category</td>
                                                                <td class="value">${ticketDetails.category?.replace(/_/g, ' ').toUpperCase()}</td>
                                                            </tr>
                                                            <tr class="info-row">
                                                                <td class="label">Subject</td>
                                                                <td class="value">${ticketDetails.subject}</td>
                                                            </tr>
                                                            <tr class="info-row">
                                                                <td class="label">User</td>
                                                                <td class="value">${ticketDetails.userName} (${ticketDetails.userEmail})</td>
                                                            </tr>
                                                            <tr class="info-row">
                                                                <td class="label">Order ID</td>
                                                                <td class="value">${ticketDetails.orderId}</td>
                                                            </tr>
                                                            <tr class="info-row">
                                                                <td class="label">Escalation Reason</td>
                                                                <td class="value" style="color: #e74c3c;">${ticketDetails.reason}</td>
                                                            </tr>
                                                            <tr class="info-row">
                                                                <td class="label">Created At</td>
                                                                <td class="value">${new Date(ticketDetails.createdAt).toLocaleString('en-IN')}</td>
                                                            </tr>
                                                        </table>
                                                        <p style="color:#455056; font-size:13px; margin-top:20px;">
                                                            Please log in to the admin panel to respond to this ticket.
                                                        </p>
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                    <tr><td style="height:40px;">&nbsp;</td></tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </body>
                </html>`,
            };
            await transPorter.sendMail(mailOptions, function (err, data) {
                if (err) {
                    console.error('[Support Mail] Escalation email error:', err);
                    reject(err);
                } else {
                    resolve(`Escalation email sent to ${adminEmail}`);
                }
            });
        } catch (error) {
            console.error('[Support Mail] Error:', error);
            reject(error);
        }
    });
};

export const support_resolution_mail = async (userEmail: string, ticketDetails: any) => {
    return new Promise(async (resolve, reject) => {
        try {
            const mailOptions = {
                from: mailUser,
                to: userEmail,
                subject: `✅ Support Ticket Resolved - ${ticketDetails.ticketId}`,
                html: `<html lang="en-US">
                <head>
                    <meta content="text/html; charset=utf-8" http-equiv="Content-Type" />
                    <title>Ticket Resolved</title>
                </head>
                <body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; background-color: #f2f3f8;" leftmargin="0">
                    <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8"
                        style="font-family: 'Open Sans', sans-serif;">
                        <tr>
                            <td>
                                <table style="background-color: #f2f3f8; max-width:670px; margin:0 auto;" width="100%" border="0"
                                    align="center" cellpadding="0" cellspacing="0">
                                    <tr><td style="height:40px;">&nbsp;</td></tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <h1 style="color:#27ae60; font-weight:700; margin:0; font-size:28px;">
                                                ✅ Ticket Resolved</h1>
                                        </td>
                                    </tr>
                                    <tr><td style="height:20px;">&nbsp;</td></tr>
                                    <tr>
                                        <td>
                                            <table width="95%" border="0" align="center" cellpadding="0" cellspacing="0"
                                                style="max-width:670px; background:#fff; border-radius:8px; text-align:left;
                                                box-shadow:0 6px 18px 0 rgba(0,0,0,.06); padding: 30px;">
                                                <tr>
                                                    <td style="padding: 20px 35px;">
                                                        <p style="color:#455056; font-size:15px; line-height:24px;">
                                                            Your support ticket <strong>${ticketDetails.ticketId}</strong> has been resolved.
                                                        </p>
                                                        <p style="color:#455056; font-size:14px;">
                                                            <strong>Subject:</strong> ${ticketDetails.subject}<br/>
                                                            <strong>Resolution:</strong> ${ticketDetails.resolution || 'Resolved by support team'}<br/>
                                                            <strong>Resolved At:</strong> ${new Date().toLocaleString('en-IN')}
                                                        </p>
                                                        <p style="color:#888; font-size:13px; margin-top:20px;">
                                                            If you still have issues, you can create a new support ticket.
                                                        </p>
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                    <tr><td style="height:40px;">&nbsp;</td></tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </body>
                </html>`,
            };
            await transPorter.sendMail(mailOptions, function (err, data) {
                if (err) {
                    console.error('[Support Mail] Resolution email error:', err);
                    reject(err);
                } else {
                    resolve(`Resolution email sent to ${userEmail}`);
                }
            });
        } catch (error) {
            console.error('[Support Mail] Error:', error);
            reject(error);
        }
    });
};

