use napi::bindgen_prelude::{Error, Result};
use rusqlite::Connection;
use std::ops::{Deref, DerefMut};
use std::sync::{Mutex, MutexGuard};

/// Shared connection storage used by Database, Statement, and Transaction.
///
/// Keeping the connection inside an Option lets Database::close() drop the
/// native connection even when statements or transaction handles still exist.
pub(crate) struct ConnectionStore {
    inner: Mutex<Option<Connection>>,
}

pub(crate) struct ConnectionGuard<'a> {
    inner: MutexGuard<'a, Option<Connection>>,
}

impl ConnectionStore {
    pub(crate) fn new(connection: Connection) -> Self {
        Self {
            inner: Mutex::new(Some(connection)),
        }
    }

    pub(crate) fn lock(&self) -> Result<ConnectionGuard<'_>> {
        let inner = self
            .inner
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        if inner.is_none() {
            return Err(Error::from_reason("Database is closed"));
        }

        Ok(ConnectionGuard { inner })
    }

    pub(crate) fn close(&self) -> Result<()> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        if let Some(connection) = inner.as_ref() {
            // A checkpoint is best effort. Dropping the connection below is
            // the operation that actually releases the SQLite resources.
            connection
                .execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")
                .ok();
        }

        inner.take();
        Ok(())
    }

    pub(crate) fn ensure_open(&self) -> Result<()> {
        let _guard = self.lock()?;
        Ok(())
    }
}

impl Deref for ConnectionGuard<'_> {
    type Target = Connection;

    fn deref(&self) -> &Self::Target {
        self.inner
            .as_ref()
            .expect("ConnectionGuard is only created for an open connection")
    }
}

impl DerefMut for ConnectionGuard<'_> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.inner
            .as_mut()
            .expect("ConnectionGuard is only created for an open connection")
    }
}
