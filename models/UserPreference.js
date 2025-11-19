import mongoose from 'mongoose';

const userPreferenceSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
  sessionId: { type: String, index: true, default: null },
  diet: {
    allergies: { type: [String], default: [] },
    dislikes: { type: [String], default: [] },
    likes: { type: [String], default: [] }
  },
  cuisines: { type: [String], default: [] },
  tagsCount: {
    healthy: { type: Number, default: 0 },
    spicy: { type: Number, default: 0 },
    sweet: { type: Number, default: 0 },
    light: { type: Number, default: 0 }
  },
  recentGoal: { type: String, default: null },
  recentCuisinePreference: { type: String, default: null },
  recentAllergies: { type: [String], default: [] },
  lastUserIntent: { type: String, default: null },
  lastMainChoice: { type: String, default: null }
}, {
  timestamps: true
});



const UserPreference = mongoose.model('UserPreference', userPreferenceSchema);
export default UserPreference;