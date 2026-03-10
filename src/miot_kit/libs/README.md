# MIoT Camera Native Libraries

This directory contains the native libraries for MIoT camera P2P functionality.

## Directory Structure

```
libs/
├── darwin/
│   ├── arm64/
│   │   └── libmiot_camera_lite.dylib    # macOS Apple Silicon
│   └── x86_64/
│       └── libmiot_camera_lite.dylib    # macOS Intel
├── linux/
│   ├── arm64/
│   │   └── libmiot_camera_lite.so      # Linux ARM64
│   └── x86_64/
│       └── libmiot_camera_lite.so      # Linux x86_64
└── win32/
    └── x64/
        └── libmiot_camera_lite.dll      # Windows x64
```

## How to Obtain the Libraries

The native libraries are from the original Python `miot_kit` project. You need to copy them from the Python project:

### From Python miot_kit project:

```bash
# macOS Apple Silicon
cp /path/to/python/miot_kit/miot/libs/darwin/arm64/libmiot_camera_lite.dylib \
   src/miot_kit/libs/darwin/arm64/

# macOS Intel
cp /path/to/python/miot_kit/miot/libs/darwin/x86_64/libmiot_camera_lite.dylib \
   src/miot_kit/libs/darwin/x86_64/

# Linux ARM64
cp /path/to/python/miot_kit/miot/libs/linux/arm64/libmiot_camera_lite.so \
   src/miot_kit/libs/linux/arm64/

# Linux x86_64
cp /path/to/python/miot_kit/miot/libs/linux/x86_64/libmiot_camera_lite.so \
   src/miot_kit/libs/linux/x86_64/
```

## Usage

Once the libraries are in place, the `camera.ts` module will automatically load the correct library for your platform:

```typescript
import { MIoTCameraManager } from './camera';

const manager = new MIoTCameraManager();
await manager.init(); // Loads the native library

// Create camera instance
const camera = manager.createInstance({
  did: 'camera123',
  model: 'xiaomi.camera.c301',
  name: 'Living Room',
  status: 'DISCONNECTED',
  channel_count: 1,
  lan_status: false,
  token: 'your-token',
  key: 'your-key',
  ip: '192.168.1.100',
});

// Connect and start streaming
await camera.connect();
camera.startStreaming();

// Handle video frames
camera.onFrame((frame) => {
  console.log(`Received frame: ${frame.width}x${frame.height}`);
});
```

## Note

- The libraries are platform-specific binary files and cannot be built from source in this project
- Make sure the library file permissions allow execution (`chmod +x` on Unix systems)
- The camera functionality requires valid authentication tokens from Xiaomi Mi Home
