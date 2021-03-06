﻿/// <reference path="../../../dist/preview release/babylon.d.ts"/>

module BABYLON {
    export enum GLTFLoaderCoordinateSystemMode {
        /**
         * Automatically convert the glTF right-handed data to the appropriate system based on the current coordinate system mode of the scene.
         */
        AUTO,

        /**
         * Sets the useRightHandedSystem flag on the scene.
         */
        FORCE_RIGHT_HANDED,
    }

    export enum GLTFLoaderAnimationStartMode {
        /**
         * No animation will start.
         */
        NONE,

        /**
         * The first animation will start.
         */
        FIRST,

        /**
         * All animations will start.
         */
        ALL,
    }

    export interface IGLTFLoaderData {
        json: Object;
        bin: Nullable<ArrayBufferView>;
    }

    export interface IGLTFLoader extends IDisposable {
        importMeshAsync: (meshesNames: any, scene: Scene, data: IGLTFLoaderData, rootUrl: string, onSuccess?: (meshes: AbstractMesh[], particleSystems: ParticleSystem[], skeletons: Skeleton[]) => void, onProgress?: (event: SceneLoaderProgressEvent) => void, onError?: (message: string, exception?: any) => void) => void;
        loadAsync: (scene: Scene, data: IGLTFLoaderData, rootUrl: string, onSuccess?: () => void, onProgress?: (event: SceneLoaderProgressEvent) => void, onError?: (message: string, exception?: any) => void) => void;
    }

    export class GLTFFileLoader implements IDisposable, ISceneLoaderPluginAsync, ISceneLoaderPluginFactory {
        public static CreateGLTFLoaderV1: (parent: GLTFFileLoader) => IGLTFLoader;
        public static CreateGLTFLoaderV2: (parent: GLTFFileLoader) => IGLTFLoader;

        // #region Common options

        /**
         * Raised when the asset has been parsed.
         * The data.json property stores the glTF JSON.
         * The data.bin property stores the BIN chunk from a glTF binary or null if the input is not a glTF binary.
         */
        public onParsed: (data: IGLTFLoaderData) => void;

        // #endregion

        // #region V1 options

        public static IncrementalLoading = true;

        public static HomogeneousCoordinates = false;

        // #endregion

        // #region V2 options

        /**
         * The coordinate system mode (AUTO, FORCE_RIGHT_HANDED).
         */
        public coordinateSystemMode = GLTFLoaderCoordinateSystemMode.AUTO;

        /**
         * The animation start mode (NONE, FIRST, ALL).
         */
        public animationStartMode = GLTFLoaderAnimationStartMode.FIRST;

        /**
         * Set to true to compile materials before raising the success callback.
         */
        public compileMaterials = false;

        /**
         * Set to true to also compile materials with clip planes.
         */
        public useClipPlane = false;

        /**
         * Set to true to compile shadow generators before raising the success callback.
         */
        public compileShadowGenerators = false;

        /**
         * Raised when the loader creates a mesh after parsing the glTF properties of the mesh.
         */
        public onMeshLoaded: (mesh: AbstractMesh) => void;

        /**
         * Raised when the loader creates a texture after parsing the glTF properties of the texture.
         */
        public onTextureLoaded: (texture: BaseTexture) => void;

        /**
         * Raised when the loader creates a material after parsing the glTF properties of the material.
         */
        public onMaterialLoaded: (material: Material) => void;

        /**
         * Raised when the asset is completely loaded, immediately before the loader is disposed.
         * For assets with LODs, raised when all of the LODs are complete.
         * For assets without LODs, raised when the model is complete, immediately after onSuccess.
         */
        public onComplete: () => void;

        // #endregion

        private _loader: IGLTFLoader;

        public name = "gltf";

        public extensions: ISceneLoaderPluginExtensions = {
            ".gltf": { isBinary: false },
            ".glb": { isBinary: true }
        };

        /**
         * Disposes the loader, releases resources during load, and cancels any outstanding requests.
         */
        public dispose(): void {
            if (this._loader) {
                this._loader.dispose();
            }
        }

        public importMeshAsync(meshesNames: any, scene: Scene, data: any, rootUrl: string, onSuccess?: (meshes: AbstractMesh[], particleSystems: ParticleSystem[], skeletons: Skeleton[]) => void, onProgress?: (event: SceneLoaderProgressEvent) => void, onError?: (message: string, exception?: any) => void): void {
            try {
                const loaderData = GLTFFileLoader._parse(data);

                if (this.onParsed) {
                    this.onParsed(loaderData);
                }

                this._loader = this._getLoader(loaderData);
                this._loader.importMeshAsync(meshesNames, scene, loaderData, rootUrl, onSuccess, onProgress, onError);
            }
            catch (e) {
                if (onError) {
                    onError(e.message, e);
                }
                else {
                    Tools.Error(e.message);
                }
            }
        }

        public loadAsync(scene: Scene, data: string | ArrayBuffer, rootUrl: string, onSuccess?: () => void, onProgress?: (event: SceneLoaderProgressEvent) => void, onError?: (message: string, exception?: any) => void): void {
            try {
                const loaderData = GLTFFileLoader._parse(data);

                if (this.onParsed) {
                    this.onParsed(loaderData);
                }

                this._loader = this._getLoader(loaderData);
                this._loader.loadAsync(scene, loaderData, rootUrl, onSuccess, onProgress, onError);
            }
            catch (e) {
                if (onError) {
                    onError(e.message, e);
                }
                else {
                    Tools.Error(e.message);
                }
            }
        }

        public canDirectLoad(data: string): boolean {
            return ((data.indexOf("scene") !== -1) && (data.indexOf("node") !== -1));
        }

        public rewriteRootURL: (rootUrl: string, responseURL?: string) => string;

        public createPlugin(): ISceneLoaderPlugin | ISceneLoaderPluginAsync {
            return new GLTFFileLoader();
        }

        private static _parse(data: string | ArrayBuffer): IGLTFLoaderData {
            if (data instanceof ArrayBuffer) {
                return GLTFFileLoader._parseBinary(data);
            }

            return {
                json: JSON.parse(data),
                bin: null
            };
        }

        private _getLoader(loaderData: IGLTFLoaderData): IGLTFLoader {
            const loaderVersion = { major: 2, minor: 0 };

            const asset = (<any>loaderData.json).asset || {};

            const version = GLTFFileLoader._parseVersion(asset.version);
            if (!version) {
                throw new Error("Invalid version: " + asset.version);
            }

            if (asset.minVersion !== undefined) {
                const minVersion = GLTFFileLoader._parseVersion(asset.minVersion);
                if (!minVersion) {
                    throw new Error("Invalid minimum version: " + asset.minVersion);
                }

                if (GLTFFileLoader._compareVersion(minVersion, loaderVersion) > 0) {
                    throw new Error("Incompatible minimum version: " + asset.minVersion);
                }
            }

            const createLoaders: { [key: number]: (parent: GLTFFileLoader) => IGLTFLoader } = {
                1: GLTFFileLoader.CreateGLTFLoaderV1,
                2: GLTFFileLoader.CreateGLTFLoaderV2
            };

            const createLoader = createLoaders[version.major];
            if (!createLoader) {
                throw new Error("Unsupported version: " + asset.version);
            }

            return createLoader(this);
        }

        private static _parseBinary(data: ArrayBuffer): IGLTFLoaderData {
            const Binary = {
                Magic: 0x46546C67
            };

            const binaryReader = new BinaryReader(data);

            const magic = binaryReader.readUint32();
            if (magic !== Binary.Magic) {
                throw new Error("Unexpected magic: " + magic);
            }

            const version = binaryReader.readUint32();
            switch (version) {
                case 1: return GLTFFileLoader._parseV1(binaryReader);
                case 2: return GLTFFileLoader._parseV2(binaryReader);
            }

            throw new Error("Unsupported version: " + version);
        }

        private static _parseV1(binaryReader: BinaryReader): IGLTFLoaderData {
            const ContentFormat = {
                JSON: 0
            };

            const length = binaryReader.readUint32();
            if (length != binaryReader.getLength()) {
                throw new Error("Length in header does not match actual data length: " + length + " != " + binaryReader.getLength());
            }

            const contentLength = binaryReader.readUint32();
            const contentFormat = binaryReader.readUint32();

            let content: Object;
            switch (contentFormat) {
                case ContentFormat.JSON: {
                    content = JSON.parse(GLTFFileLoader._decodeBufferToText(binaryReader.readUint8Array(contentLength)));
                    break;
                }
                default: {
                    throw new Error("Unexpected content format: " + contentFormat);
                }
            }

            const bytesRemaining = binaryReader.getLength() - binaryReader.getPosition();
            const body = binaryReader.readUint8Array(bytesRemaining);

            return {
                json: content,
                bin: body
            };
        }

        private static _parseV2(binaryReader: BinaryReader): IGLTFLoaderData {
            const ChunkFormat = {
                JSON: 0x4E4F534A,
                BIN: 0x004E4942
            };

            const length = binaryReader.readUint32();
            if (length !== binaryReader.getLength()) {
                throw new Error("Length in header does not match actual data length: " + length + " != " + binaryReader.getLength());
            }

            // JSON chunk
            const chunkLength = binaryReader.readUint32();
            const chunkFormat = binaryReader.readUint32();
            if (chunkFormat !== ChunkFormat.JSON) {
                throw new Error("First chunk format is not JSON");
            }
            const json = JSON.parse(GLTFFileLoader._decodeBufferToText(binaryReader.readUint8Array(chunkLength)));

            // Look for BIN chunk
            let bin: Nullable<Uint8Array> = null;
            while (binaryReader.getPosition() < binaryReader.getLength()) {
                const chunkLength = binaryReader.readUint32();
                const chunkFormat = binaryReader.readUint32();
                switch (chunkFormat) {
                    case ChunkFormat.JSON: {
                        throw new Error("Unexpected JSON chunk");
                    }
                    case ChunkFormat.BIN: {
                        bin = binaryReader.readUint8Array(chunkLength);
                        break;
                    }
                    default: {
                        // ignore unrecognized chunkFormat
                        binaryReader.skipBytes(chunkLength);
                        break;
                    }
                }
            }

            return {
                json: json,
                bin: bin
            };
        }

        private static _parseVersion(version: string): Nullable<{ major: number, minor: number }> {
            if (version === "1.0" || version === "1.0.1") {
                return {
                    major: 1,
                    minor: 0
                };
            }

            const match = (version + "").match(/^(\d+)\.(\d+)/);
            if (!match) {
                return null;
            }

            return {
                major: parseInt(match[1]),
                minor: parseInt(match[2])
            };
        }

        private static _compareVersion(a: { major: number, minor: number }, b: { major: number, minor: number }) {
            if (a.major > b.major) return 1;
            if (a.major < b.major) return -1;
            if (a.minor > b.minor) return 1;
            if (a.minor < b.minor) return -1;
            return 0;
        }

        private static _decodeBufferToText(buffer: Uint8Array): string {
            let result = "";
            const length = buffer.byteLength;

            for (let i = 0; i < length; i++) {
                result += String.fromCharCode(buffer[i]);
            }

            return result;
        }
    }

    class BinaryReader {
        private _arrayBuffer: ArrayBuffer;
        private _dataView: DataView;
        private _byteOffset: number;

        constructor(arrayBuffer: ArrayBuffer) {
            this._arrayBuffer = arrayBuffer;
            this._dataView = new DataView(arrayBuffer);
            this._byteOffset = 0;
        }

        public getPosition(): number {
            return this._byteOffset;
        }

        public getLength(): number {
            return this._arrayBuffer.byteLength;
        }

        public readUint32(): number {
            const value = this._dataView.getUint32(this._byteOffset, true);
            this._byteOffset += 4;
            return value;
        }

        public readUint8Array(length: number): Uint8Array {
            const value = new Uint8Array(this._arrayBuffer, this._byteOffset, length);
            this._byteOffset += length;
            return value;
        }

        public skipBytes(length: number): void {
            this._byteOffset += length;
        }
    }

    if (BABYLON.SceneLoader) {
        BABYLON.SceneLoader.RegisterPlugin(new GLTFFileLoader());
    }
}
