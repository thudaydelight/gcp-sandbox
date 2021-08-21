const ffmpeg = require('fluent-ffmpeg')
const ffmpegPath = require('ffmpeg-static')
const fs = require('fs')
const os = require('os')
const path = require('path')
const admin = require('firebase-admin')
const functions = require('firebase-functions')

admin.initializeApp()

const isValid = (data, context) => {
    return (data.contentType === 'video/mp4' || data.contentType === 'video/quicktime') &&
        (data.name.endsWith('.mp4') || data.name.endsWith('.MOV')) &&
        context.eventType === 'google.storage.object.finalize' && !data.name.includes('video_compressed')
}

function promisifyCommand(command) {
    return new Promise((resolve, reject) => {
        command.on('end', resolve).on('error', reject).run();
    });
}

exports.mp4ToHls = functions
    .runWith({memory: "8GB", timeoutSeconds: 540})
    .storage.object()
    .onFinalize(
        async (data, context, callback) => {
            if (!isValid(data, context)) {
                console.log('invalid data or invalid context.')

                return
            }

            const outputDir = path.join(os.tmpdir(), "output")
            fs.mkdirSync(outputDir, {recursive: true})
            const downloadDir = path.join(os.tmpdir(), "download")
            fs.mkdirSync(downloadDir, {recursive: true})

            const downloadPath = path.join(downloadDir, data.name);
            const outputPath = path.join(outputDir, data.name + '-1280x720.mp4');

            console.log(`download path: ${downloadPath}`)
            console.log(`outputPath : ${outputPath}`)
            await admin.storage().bucket(data.bucket).file(data.name).download({destination: downloadPath}).then((reskt) => {
                console.log("downloaded" + getFilesizeInBytes(downloadPath))
            }).catch((error) => {
                console.error(`error when download: ${error.toString()}`)
            })
            try {
                let command = ffmpeg(downloadPath)
                    .setFfmpegPath(ffmpegPath)
                    .output(outputPath)
                    .videoCodec('libx264')
                    .size('1280x720')
                await promisifyCommand(command);
                console.log(`Size of compressed file: ${getFilesizeInBytes(outputPath)}`)
                await admin.storage().bucket(data.bucket).upload(outputPath, {
                    destination: "video_compressed/compressed.mp4",
                    metadata: {
                        compressed: true
                    }
                }).catch((error) => {
                    console.error(error)
                }).then(async (result) => {

                    console.log(result[1])
                    console.log("Upload result" + JSON.stringify(result[1]))
                })
            } catch (e) {
                console.error(e)
            } finally {
                fs.unlink(downloadPath, (error) => {
                        console.error(error)
                    }
                )
                fs.unlink(outputPath, (error) => {
                    console.error(error)
                })
            }
        })

function getFilesizeInBytes(filename) {
    const stats = fs.statSync(filename);
    return stats.size;
}
