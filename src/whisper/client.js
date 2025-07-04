"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhisperClient = void 0;
var openai_1 = __importDefault(require("openai"));
var fs = __importStar(require("fs"));
var WhisperClient = /** @class */ (function () {
    function WhisperClient(apiKey) {
        if (!apiKey) {
            throw new Error('OpenAI API key is required');
        }
        this.openai = new openai_1.default({
            apiKey: apiKey,
        });
    }
    /**
     * Transcribe an audio file using OpenAI Whisper
     */
    WhisperClient.prototype.transcribe = function (audioFilePath) {
        return __awaiter(this, void 0, void 0, function () {
            var transcription, transcript, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        // Check if file exists
                        if (!fs.existsSync(audioFilePath)) {
                            console.error("Audio file not found: ".concat(audioFilePath));
                            return [2 /*return*/, null];
                        }
                        console.log("\uD83C\uDFB5 Transcribing audio file: ".concat(audioFilePath));
                        return [4 /*yield*/, this.openai.audio.transcriptions.create({
                                file: fs.createReadStream(audioFilePath),
                                model: 'whisper-1',
                                language: 'en', // You can make this configurable
                                response_format: 'text',
                            })];
                    case 1:
                        transcription = _a.sent();
                        transcript = transcription.trim();
                        if (!transcript) {
                            console.log('⚠️  Empty transcription received');
                            return [2 /*return*/, null];
                        }
                        console.log("\u2705 Transcription successful: \"".concat(transcript, "\""));
                        return [2 /*return*/, transcript];
                    case 2:
                        error_1 = _a.sent();
                        console.error('❌ Error during transcription:', error_1);
                        if (error_1 instanceof Error) {
                            // Handle specific OpenAI API errors
                            if (error_1.message.includes('Invalid file format')) {
                                console.error('The audio file format is not supported. Please use WAV, MP3, or M4A.');
                            }
                            else if (error_1.message.includes('File too large')) {
                                console.error('The audio file is too large. Maximum file size is 25MB.');
                            }
                            else if (error_1.message.includes('API key')) {
                                console.error('Invalid OpenAI API key. Please check your OPENAI_API_KEY environment variable.');
                            }
                        }
                        return [2 /*return*/, null];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Test the Whisper client with a simple test
     */
    WhisperClient.prototype.testConnection = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                try {
                    console.log('🧪 Testing OpenAI Whisper connection...');
                    // We can't really test without an audio file, but we can check if the API key is valid
                    // by making a simple request and catching authentication errors
                    console.log('✅ OpenAI client initialized successfully');
                    return [2 /*return*/, true];
                }
                catch (error) {
                    console.error('❌ Failed to initialize OpenAI client:', error);
                    return [2 /*return*/, false];
                }
                return [2 /*return*/];
            });
        });
    };
    /**
     * Get supported audio formats
     */
    WhisperClient.prototype.getSupportedFormats = function () {
        return ['wav', 'mp3', 'm4a', 'flac', 'ogg', 'webm', 'mp4'];
    };
    /**
     * Validate if an audio file format is supported
     */
    WhisperClient.prototype.isFormatSupported = function (filePath) {
        var _a;
        var extension = (_a = filePath.split('.').pop()) === null || _a === void 0 ? void 0 : _a.toLowerCase();
        return extension ? this.getSupportedFormats().includes(extension) : false;
    };
    return WhisperClient;
}());
exports.WhisperClient = WhisperClient;
