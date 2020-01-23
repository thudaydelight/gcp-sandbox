const ffmpeg = require('fluent-ffmpeg')()
const ffmpegPath = require('ffmpeg-static')
const fs = require('fs')
const os = require('os')
const path = require('path')
const process = require('child_process')
const storage = require('@google-cloud/storage')

exports.mp4ToHls = async (data, context, callback) => {
  console.log(`ffmpegPath: ${ffmpegPath}`)
  console.log(`data: ${JSON.stringify(data)}`)
  console.log(`context: ${JSON.stringify(context)}`)

  const gcs = new storage.Storage()

  const info = {}

  info.mp4DirectoryName = 'mp4'
  info.hlsDirectoryName = 'hls'
  info.baseName = path.basename(data.name, '.mp4')
  info.keyFileName = `${info.baseName}.key`
  info.iv = process.execSync('openssl rand -hex 16').toString()

  info.bucketMp4Directory = path.join(info.mp4DirectoryName, info.baseName)
  info.bucketHlsDirectory = path.join(info.hlsDirectoryName, info.baseName)
  info.bucketHlsKeyFilePath = path.join(info.bucketHlsDirectory, info.keyFileName)

  info.localMp4Directory = path.join(os.tmpdir(), info.bucketMp4Directory)
  info.localHlsDirectory = path.join(os.tmpdir(), info.bucketHlsDirectory)
  info.localHlsKeyFilePath = path.join(info.localHlsDirectory, info.keyFileName)
  info.localMp4FilePath = path.join(info.localMp4Directory, path.basename(data.name))
  info.localHlsFilePath = path.join(info.localHlsDirectory, `${info.baseName}.m3u8`)
  info.localKeyInfoPath = path.join(os.tmpdir(), 'keyinfo')

  console.log(`info: ${JSON.stringify(info)}`)

  fs.mkdirSync(info.localMp4Directory, { recursive: true })
  fs.mkdirSync(info.localHlsDirectory, { recursive: true })

  process.execSync(`openssl rand 16 > ${info.localHlsKeyFilePath}`)

  fs.writeFileSync(info.localKeyInfoPath, [info.keyFileName, info.localHlsKeyFilePath, info.iv].join('\n'))

  await gcs.bucket(data.bucket).file(data.name).download({ destination: info.localMp4FilePath })

  ffmpeg
    .setFfmpegPath(ffmpegPath)
    .input(info.localMp4FilePath)
    .output(info.localHlsFilePath)
    .outputOptions([
      '-codec: copy',
      '-hls_time 10',
      '-hls_list_size 0',
      `-hls_key_info_file ${info.localKeyInfoPath}`,
    ])
    .on('end', (error, stdout) => {
      console.log(stdout)

      fs.readdirSync(info.localHlsDirectory).forEach(async (fileName) => {
        console.log(fileName)

        const src = path.join(info.localHlsDirectory, fileName)
        const dest = path.join(info.bucketHlsDirectory, fileName)

        await gcs.bucket(data.bucket).upload(src, { destination: dest })
      })

      callback()
    })
    .on('error', (error, stdout, stderr) => {
      console.log(error)
      console.log(stdout)
      console.log(stderr)

      callback()
    })
    .run()
}
