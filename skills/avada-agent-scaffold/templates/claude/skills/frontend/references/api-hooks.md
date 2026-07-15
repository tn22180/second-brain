# API Hooks

## Fetch Data

```javascript
const {data, loading, fetchApi} = useFetchApi({
  url: '/api/resources',
  defaultData: [],
  initLoad: true  // Load on mount
});
```

## Create/Update

```javascript
const {creating, handleCreate} = useCreateApi({
  url: '/api/resources',
  successMsg: 'Resource created successfully',
  successCallback: () => fetchApi()
});

// Usage
await handleCreate({ name, status });
```

## Delete

```javascript
const {deleting, handleDelete} = useDeleteApi({
  url: '/api/resources',
  successMsg: 'Resource deleted',
  successCallback: () => fetchApi()
});

// Usage
await handleDelete(resourceId);
```

## Edit (Update)

```javascript
const {editing, handleEdit} = useEditApi({
  url: `/api/resources/${resourceId}`,
  successMsg: 'Resource updated successfully',
  successCallback: () => fetchApi()
});

// Usage
await handleEdit({ name, status });
```

## useFetchApi Options

| Option | Type | Description |
|--------|------|-------------|
| `url` | string | API endpoint |
| `defaultData` | any | Default value while loading |
| `initLoad` | boolean | Load on component mount |
| `params` | object | Query parameters |

## Hook Return Values

### useFetchApi

| Property | Type | Description |
|----------|------|-------------|
| `data` | any | Response data |
| `loading` | boolean | Loading state |
| `fetchApi` | function | Refetch function |
| `setData` | function | Update local data |

### useCreateApi / useEditApi

| Property | Type | Description |
|----------|------|-------------|
| `creating` / `editing` | boolean | Loading state |
| `handleCreate` / `handleEdit` | function | Submit function |

### useDeleteApi

| Property | Type | Description |
|----------|------|-------------|
| `deleting` | boolean | Loading state |
| `handleDelete` | function | Delete function |

## Error Handling

```javascript
const {handleCreate} = useCreateApi({
  url: '/api/resources',
  successMsg: 'Created!',
  errorCallback: (error) => {
    console.error('Failed:', error);
    // Custom error handling
  }
});
```
