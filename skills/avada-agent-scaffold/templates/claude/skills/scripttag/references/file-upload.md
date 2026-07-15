# File Upload Pattern

When a feature requires file uploads (submit a form with attachments), use
`FileReader` to convert files to base64, then upload sequentially via API before
submitting the form.

## FileReader Base64 Conversion

```javascript
#_fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);  // data:image/jpeg;base64,...
        return;
      }
      reject(new Error('Invalid file data'));
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
```

## Sequential Upload with Error Handling

```javascript
handleUploadAndSubmit = async ({config, resource, formData = {}}) => {
  const files = Array.isArray(formData?.files) ? formData.files : [];

  // Validate required files
  if (config?.requireFile && !files.length) {
    return this.#_error('Please upload at least one file');
  }

  // Upload files sequentially (not parallel — backend rate limits)
  const uploadedUrls = [];
  for (const file of files) {
    try {
      const fileBase64 = await this.#_fileToBase64(file);
      const uploadResponse = await this.#_apiManager.postData('/upload', {
        fileBase64,
        fileName: file.name,
        fileType: file.type,
        shopId: window.APP_DATA.shopId,
        resourceId: resource.id
      });

      if (uploadResponse?.error) {
        return this.#_error(uploadResponse.error);
      }

      const uploadedUrl = uploadResponse?.fileUrl || uploadResponse?.data?.fileUrl;
      if (uploadedUrl) uploadedUrls.push(uploadedUrl);
    } catch (err) {
      return this.#_error(err?.message || 'Failed to upload file');
    }
  }

  // Submit form with uploaded URLs
  return this.#_apiManager.postData('/submit', {
    resourceId: resource.id,
    configId: config.id,
    content: formData.content,
    uploadedUrls,
    shopId: window.APP_DATA.shopId
  });
};
```

## Widget Integration

```javascript
const result = await appInstance.handleUploadAndSubmit({
  config: {id: 'config-123', requireFile: true},
  resource: {id: 'resource-456'},
  formData: {content: 'My text...', files: [file1, file2]}
});

if (result.status) {
  showSuccess('Submitted!');
} else {
  showError(result.error);
}
```

## Key Points

- **FileReader.readAsDataURL()**: Returns base64 data URL string
- **Sequential uploads**: Process one file at a time to avoid rate limits
- **Early error return**: Stop on first upload failure, don't continue
- **Graceful degradation**: Handle both `response.fileUrl` and `response.data.fileUrl`
- **File metadata**: Always send `fileName` and `fileType` for proper storage
