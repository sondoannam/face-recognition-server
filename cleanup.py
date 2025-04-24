import logging
from db import get_db_cursor, get_db_connection

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def cleanup_cancelled_registrations():
    """Clean up face data from cancelled registrations"""
    try:
        logger.info("Starting cleanup of cancelled registrations")
        
        # Get all cancelled registration IDs
        cancelled_ids = []
        with get_db_cursor() as cur:
            cur.execute("SELECT registration_id FROM cancel_points")
            cancelled_ids = [row[0] for row in cur.fetchall()]
            
        if not cancelled_ids:
            logger.info("No cancelled registrations to clean up")
            return
            
        logger.info(f"Found {len(cancelled_ids)} cancelled registrations to clean up")
        
        # Process each cancelled registration
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                for reg_id in cancelled_ids:
                    try:
                        # Find and delete user_faces with this registration_id
                        cur.execute("DELETE FROM user_faces WHERE registration_id = %s RETURNING user_id", (reg_id,))
                        affected_users = {row[0] for row in cur.fetchall()}
                        
                        # Check if any users no longer have face data and should be removed
                        for user_id in affected_users:
                            cur.execute("SELECT COUNT(*) FROM user_faces WHERE user_id = %s", (user_id,))
                            if cur.fetchone()[0] == 0:
                                cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
                                logger.info(f"Deleted user {user_id} with no remaining face data")
                        
                        # Remove the cancel point
                        cur.execute("DELETE FROM cancel_points WHERE registration_id = %s", (reg_id,))
                        logger.info(f"Successfully processed cancelled registration: {reg_id}")
                    
                    except Exception as e:
                        logger.error(f"Error cleaning up registration {reg_id}: {e}")
                        # Continue with other registrations even if one fails
        
        logger.info("Cleanup completed successfully")
    
    except Exception as e:
        logger.error(f"Error during cleanup process: {e}")
        raise

def cleanup_orphaned_faces():
    """Clean up face data that has no associated user (could happen from failed transactions)"""
    try:
        logger.info("Starting cleanup of orphaned face records")
        
        with get_db_cursor() as cur:
            # Delete face data where the user_id doesn't exist
            cur.execute("""
                DELETE FROM user_faces
                WHERE user_id NOT IN (SELECT id FROM users)
                RETURNING id
            """)
            deleted = cur.fetchall()
            
            if deleted:
                logger.info(f"Deleted {len(deleted)} orphaned face records")
            else:
                logger.info("No orphaned face records found")
    
    except Exception as e:
        logger.error(f"Error cleaning up orphaned faces: {e}")

if __name__ == "__main__":
    cleanup_cancelled_registrations()
    cleanup_orphaned_faces()
    print("Cleanup process completed.")
