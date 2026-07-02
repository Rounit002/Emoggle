-- Celebrity Face Mimic feature migration
-- Add celebrity_faces table for the new game mode

CREATE TABLE IF NOT EXISTS celebrity_faces (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL, -- 'meme', 'celebrity', 'character'
  image_url TEXT NOT NULL,
  difficulty VARCHAR(20) DEFAULT 'medium', -- 'easy', 'medium', 'hard'
  facial_landmarks JSONB, -- Pre-computed landmark data for comparison
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_celebrity_faces_category ON celebrity_faces(category);
CREATE INDEX idx_celebrity_faces_difficulty ON celebrity_faces(difficulty);
CREATE INDEX idx_celebrity_faces_usage ON celebrity_faces(usage_count);

-- Insert some sample celebrity faces
INSERT INTO celebrity_faces (name, category, image_url, difficulty) VALUES
('Drake No', 'meme', '/celebrity-faces/memes/drake-no.jpg', 'easy'),
('Success Kid', 'meme', '/celebrity-faces/memes/success-kid.jpg', 'easy'),
('Surprised Pikachu', 'meme', '/celebrity-faces/memes/surprised-pikachu.jpg', 'medium'),
('Leo DiCaprio Cheers', 'celebrity', '/celebrity-faces/celebrities/leo-dicaprio-cheers.jpg', 'medium'),
('Morgan Freeman Smile', 'celebrity', '/celebrity-faces/celebrities/morgan-freeman-smile.jpg', 'medium');
