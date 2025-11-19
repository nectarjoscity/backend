import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
  content: { type: String, required: true }
}, { _id: false });

const conversationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
  sessionId: { type: String, index: true, default: null },
  text: { type: String, required: true },
  messages: { type: [messageSchema], default: [] },
  result: { type: Object, default: {} }
}, {
  timestamps: true
});

const Conversation = mongoose.model('Conversation', conversationSchema);
export default Conversation;