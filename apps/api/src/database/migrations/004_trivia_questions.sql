-- Migration 004: Trivia questions table
-- game_definitions already exists from 001_initial_schema.sql.
-- This adds the trivia_questions table and 20 seed questions.

CREATE TABLE trivia_questions (
  id            UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  question      TEXT      NOT NULL,
  options       JSONB     NOT NULL,         -- ["opt A", "opt B", "opt C", "opt D"]
  correct_index SMALLINT  NOT NULL,         -- 0-3, NEVER sent to client
  category      TEXT,
  difficulty    SMALLINT  NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
  is_active     BOOLEAN   NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trivia_questions_difficulty ON trivia_questions (difficulty) WHERE is_active = true;
CREATE INDEX idx_trivia_questions_category   ON trivia_questions (category)  WHERE is_active = true;
CREATE INDEX idx_trivia_questions_active     ON trivia_questions (is_active);

-- Seed 20 questions across categories and difficulties
INSERT INTO trivia_questions (question, options, correct_index, category, difficulty) VALUES
  ('What is the capital of France?',
   '["London","Berlin","Paris","Madrid"]',
   2, 'geography', 1),

  ('How many sides does a hexagon have?',
   '["5","6","7","8"]',
   1, 'math', 1),

  ('What planet is known as the Red Planet?',
   '["Venus","Jupiter","Mars","Saturn"]',
   2, 'science', 1),

  ('Who painted the Mona Lisa?',
   '["Van Gogh","Picasso","Da Vinci","Rembrandt"]',
   2, 'art', 2),

  ('What is 15% of 200?',
   '["25","30","35","40"]',
   1, 'math', 2),

  ('In what year did World War II end?',
   '["1943","1944","1945","1946"]',
   2, 'history', 2),

  ('What is the chemical symbol for Gold?',
   '["Ag","Fe","Au","Cu"]',
   2, 'science', 2),

  ('How many bones are in the adult human body?',
   '["196","206","216","226"]',
   1, 'science', 3),

  ('What is the square root of 144?',
   '["11","12","13","14"]',
   1, 'math', 2),

  ('Which country invented pizza?',
   '["Greece","Italy","Spain","France"]',
   1, 'culture', 1),

  ('What is the largest ocean on Earth?',
   '["Atlantic","Indian","Arctic","Pacific"]',
   3, 'geography', 1),

  ('Who wrote Romeo and Juliet?',
   '["Dickens","Shakespeare","Austen","Chaucer"]',
   1, 'literature', 2),

  ('What is 7 x 8?',
   '["54","56","58","64"]',
   1, 'math', 1),

  ('What gas do plants absorb from the atmosphere?',
   '["Oxygen","Nitrogen","Carbon Dioxide","Hydrogen"]',
   2, 'science', 2),

  ('What is the longest river in the world?',
   '["Amazon","Congo","Nile","Yangtze"]',
   2, 'geography', 2),

  ('How many players are on a standard soccer team?',
   '["9","10","11","12"]',
   2, 'sports', 1),

  ('What does DNA stand for?',
   '["Deoxyribonucleic Acid","Double Nucleic Acid","Dynamic Nucleotide Array","Deoxyribose Nucleotide Array"]',
   0, 'science', 3),

  ('Which planet has the most moons?',
   '["Jupiter","Saturn","Uranus","Neptune"]',
   1, 'science', 3),

  ('What is the hardest natural substance on Earth?',
   '["Gold","Iron","Diamond","Quartz"]',
   2, 'science', 2),

  ('In which year did the first iPhone launch?',
   '["2005","2006","2007","2008"]',
   2, 'technology', 2);
