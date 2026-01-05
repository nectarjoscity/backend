import mongoose from 'mongoose';

const SettingSchema = new mongoose.Schema(
    {
        key: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        value: {
            type: mongoose.Schema.Types.Mixed,
            required: true,
        },
        description: {
            type: String,
            default: '',
        },
        isPublic: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

const Setting = mongoose.model('Setting', SettingSchema);
export default Setting;
