package main

import (
	"os"
	"strconv"
)

// Config holds application configuration
type Config struct {
	Port           string
	RedisURL       string
	RabbitMQURL    string
	JWTSecret      string
	LogLevel       string
	MaxConnections int
	RequestTimeout int
}

// LoadConfig loads configuration from environment variables
func LoadConfig() *Config {
	return &Config{
		Port:           getEnv("PORT", "5003"),
		RedisURL:       getEnv("REDIS_URL", "redis://localhost:6379"),
		RabbitMQURL:    getEnv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672"),
		JWTSecret:      getEnv("JWT_SECRET", "eventify_jwt_secret_key_2026"),
		LogLevel:       getEnv("LOG_LEVEL", "info"),
		MaxConnections: getEnvInt("MAX_CONNECTIONS", 100),
		RequestTimeout: getEnvInt("REQUEST_TIMEOUT", 30),
	}
}

// Helper function to get environment variable with default
func getEnv(key, defaultVal string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultVal
}

// Helper function to get integer environment variable with default
func getEnvInt(key string, defaultVal int) int {
	valStr := getEnv(key, "")
	if val, err := strconv.Atoi(valStr); err == nil {
		return val
	}
	return defaultVal
}
