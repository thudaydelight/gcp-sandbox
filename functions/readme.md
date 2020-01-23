convert MP4 to HLS on Cloud Storage x Cloud Functions example

## deploy

```
gcloud functions deploy mp4ToHls --region asia-northeast1 --runtime nodejs10 --trigger-resource YOUR_TRIGGER_BUCKET_NAME --trigger-event google.storage.object.finalize
```

## LICENCE

WTFPL
