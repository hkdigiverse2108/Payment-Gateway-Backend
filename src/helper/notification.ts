import gcm from 'node-gcm'

const sender = new gcm.Sender(process.env.FCM_KEY)

export const notification_to_user = async (sender_user_data: any, data: any, notification: any) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (sender_user_data && data && notification && sender_user_data?.deviceToken?.length != 0 && sender_user_data != undefined && sender_user_data != null) {
                let message = new gcm.Message({
                    data: data,
                    notification: notification
                });
                sender.send(message, {
                    registrationTokens: sender_user_data?.deviceToken
                }, function (err, response) {
                    if (err) {
                        reject(err)
                    } else {
                        resolve(response)
                    }
                })
            }
            else {
                resolve(true)
            }
        } catch (error) {
            reject(error)
        }
    })
}

export const notification_to_multiple_user = async (multiple_user_data: any, data: any, notification: any) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (multiple_user_data && data && notification) {
                let deviceToken: any = []
                for (let i = 0; i < multiple_user_data?.length; i++) {
                    deviceToken.push(...multiple_user_data[i]?.deviceToken)
                }
                if (deviceToken.length != 0) {
                    let message = new gcm.Message({
                        data: data,
                        notification: notification
                    });
                    sender.send(message, {
                        registrationTokens: deviceToken
                    }, function (err, response) {
                        if (err) {
                            reject(err)
                        } else {
                            resolve(response)
                        }
                    })
                }
                else {
                    resolve(true)
                }
            }
            else {
                resolve(true)
            }
        } catch (error) {
            reject(error)
        }
    })
}